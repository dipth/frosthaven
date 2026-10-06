import {
  CommandError,
  executeCommand,
  projectFor,
  REVEALING_COMMANDS,
  type CampaignState,
  type CommandContext,
  type CommandLog,
  type LogLine,
  type PresenceUser,
  type ServerMessage
} from '@fh/engine';
import { and, desc, eq, isNotNull, isNull, lte, ne } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../db';
import { campaigns, events, playSessions, type User } from '../db/schema';

/** How many recent events keep their `state_before` (i.e. how far back undo reaches). */
export const UNDO_DEPTH = 100;

export interface HubClient {
  user: User;
  send(message: ServerMessage): void;
}

export class HubError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
  }
}

/** One loaded campaign: authoritative state, connected clients, serialized writes. */
export class Room {
  readonly clients = new Set<HubClient>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: Db,
    private readonly log: FastifyBaseLogger,
    readonly campaignId: string,
    public state: CampaignState,
    public revision: number,
    public playSessionId: string | null
  ) {}

  /** Runs `fn` after all previously queued work for this room. */
  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  join(client: HubClient) {
    this.clients.add(client);
    client.send({ t: 'state', revision: this.revision, state: projectFor(this.state, client.user.id) });
    this.broadcastPresence();
  }

  leave(client: HubClient) {
    this.clients.delete(client);
    this.broadcastPresence();
  }

  presence(): PresenceUser[] {
    const seen = new Map<string, PresenceUser>();
    for (const client of this.clients) {
      seen.set(client.user.id, { id: client.user.id, displayName: client.user.displayName });
    }
    return [...seen.values()];
  }

  private broadcastPresence() {
    const message: ServerMessage = { t: 'presence', users: this.presence() };
    for (const client of this.clients) {
      client.send(message);
    }
  }

  private broadcastState(line?: LogLine) {
    for (const client of this.clients) {
      client.send({ t: 'state', revision: this.revision, state: projectFor(this.state, client.user.id), log: line });
    }
  }

  /** Applies an engine command and persists it. Returns the new revision. */
  dispatch(user: User, type: string, payload: unknown): Promise<number> {
    return this.serialize(async () => {
      const ctx: CommandContext = { userId: user.id, isAdmin: user.role === 'admin' };
      const result = executeCommand(this.state, type, payload, ctx);
      return this.commit(user, type, payload, result.state, result.log);
    });
  }

  /** Replaces the whole state (imports, admin edits) as a single undoable event. */
  replaceState(user: User, type: string, state: CampaignState, message: string): Promise<number> {
    return this.serialize(() => this.commit(user, type, {}, state, { ghs: [], messages: [message] }));
  }

  private async commit(user: User, type: string, payload: unknown, nextState: CampaignState, log: CommandLog) {
    const before = this.state;
    const revision = this.revision + 1;
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(campaigns)
        .set({ state: nextState, revision, updatedAt: new Date() })
        .where(and(eq(campaigns.id, this.campaignId), eq(campaigns.revision, this.revision)))
        .returning({ id: campaigns.id });
      if (updated.length !== 1) {
        throw new HubError('Campaign was modified elsewhere; reload', 'conflict');
      }
      await tx.insert(events).values({
        campaignId: this.campaignId,
        playSessionId: this.playSessionId,
        revision,
        userId: user.id,
        type,
        payload: payload ?? {},
        log,
        stateBefore: before
      });
      await tx
        .update(events)
        .set({ stateBefore: null })
        .where(and(eq(events.campaignId, this.campaignId), lte(events.revision, revision - UNDO_DEPTH), isNotNull(events.stateBefore)));
    });
    this.state = nextState;
    this.revision = revision;
    this.broadcastState({ revision, userId: user.id, type, log, createdAt: new Date().toISOString() });
    return revision;
  }

  /** Reverts the most recent not-yet-undone event. */
  undo(user: User, force = false): Promise<number> {
    return this.serialize(async () => {
      const last = await this.db.query.events.findFirst({
        where: and(eq(events.campaignId, this.campaignId), isNull(events.undoneAt), ne(events.type, 'system.undo'), isNotNull(events.stateBefore)),
        orderBy: desc(events.revision)
      });
      if (!last?.stateBefore) {
        throw new HubError('Nothing to undo', 'invalid_state');
      }
      if (!force && REVEALING_COMMANDS.has(last.type)) {
        throw new HubError('The last action drew or revealed cards. Undo it anyway?', 'confirm_required');
      }
      await this.db.update(events).set({ undoneAt: new Date() }).where(eq(events.id, last.id));
      const summary = last.log.messages[0] ?? last.log.ghs[0]?.[0] ?? last.type;
      return this.commit(user, 'system.undo', { revision: last.revision }, last.stateBefore, {
        ghs: [],
        messages: [`Undid "${summary}" (revision ${last.revision})`]
      });
    });
  }

  setPlaySession(id: string | null) {
    this.playSessionId = id;
  }
}

export class CampaignHub {
  private readonly rooms = new Map<string, Promise<Room>>();

  constructor(
    private readonly db: Db,
    private readonly log: FastifyBaseLogger
  ) {}

  room(campaignId: string): Promise<Room> {
    let room = this.rooms.get(campaignId);
    if (!room) {
      room = this.load(campaignId);
      this.rooms.set(campaignId, room);
      room.catch(() => this.rooms.delete(campaignId));
    }
    return room;
  }

  private async load(campaignId: string): Promise<Room> {
    const campaign = await this.db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
    if (!campaign) {
      throw new HubError('Campaign not found', 'not_found');
    }
    const session = await this.db.query.playSessions.findFirst({
      where: and(eq(playSessions.campaignId, campaignId), isNull(playSessions.endedAt)),
      orderBy: desc(playSessions.startedAt)
    });
    return new Room(this.db, this.log, campaignId, campaign.state, campaign.revision, session?.id ?? null);
  }

  /** Drops a loaded room (e.g. after deleting the campaign). */
  evict(campaignId: string) {
    this.rooms.delete(campaignId);
  }
}

export function errorMessage(error: unknown): { code: string; error: string } {
  if (error instanceof CommandError || error instanceof HubError) {
    return { code: error.code, error: error.message };
  }
  return { code: 'internal', error: 'Internal error' };
}
