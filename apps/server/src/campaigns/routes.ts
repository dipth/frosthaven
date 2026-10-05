import {
  campaignFromGhs,
  clientMessage,
  exportGhsDatadump,
  exportGhsGame,
  GhsImportError,
  newCampaignState,
  parseGhsFile,
  type ServerMessage
} from '@fh/engine';
import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db';
import { campaigns, events, imports, playSessions, users } from '../db/schema';
import { CampaignHub, errorMessage, HubError, type HubClient } from './hub';

const idParams = z.object({ id: z.uuid() });

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';
}

export async function campaignRoutes(app: FastifyInstance, { db, hub }: { db: Db; hub: CampaignHub }) {
  app.get('/api/campaigns', async () => {
    return db
      .select({ id: campaigns.id, name: campaigns.name, revision: campaigns.revision, updatedAt: campaigns.updatedAt })
      .from(campaigns)
      .orderBy(desc(campaigns.updatedAt));
  });

  app.post('/api/campaigns', async (req, reply) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
    const [campaign] = await db.insert(campaigns).values({ name, state: newCampaignState(name) }).returning({ id: campaigns.id });
    return reply.code(201).send(campaign);
  });

  /** Creates a campaign from a GHS game export or data dump. */
  app.post('/api/campaigns/import', async (req, reply) => {
    const body = z.object({ filename: z.string().optional(), name: z.string().trim().max(100).optional(), data: z.unknown() }).parse(req.body);
    const parsed = parseGhsFile(body.data);
    if (parsed.kind === 'settings') {
      throw new GhsImportError('This is a GHS settings file; export the game or a data dump instead');
    }
    const state = campaignFromGhs(parsed.game, parsed.kind === 'datadump' ? parsed.settings : undefined);
    const name = body.name || state.ghs.party?.name || body.filename || 'Imported campaign';
    const campaign = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(campaigns)
        .values({ name, state, ghsSettings: parsed.kind === 'datadump' ? parsed.settings : undefined })
        .returning({ id: campaigns.id });
      await tx.insert(imports).values({
        campaignId: created!.id,
        filename: body.filename,
        kind: parsed.kind,
        raw: body.data as object,
        createdBy: req.user!.id
      });
      return created!;
    });
    return reply.code(201).send(campaign);
  });

  /** Replaces an existing campaign's state from a GHS file (admin only, undoable). */
  app.post('/api/campaigns/:id/import', async (req, reply) => {
    if (req.user!.role !== 'admin') {
      return reply.code(403).send({ error: 'Admins only' });
    }
    const { id } = idParams.parse(req.params);
    const body = z.object({ filename: z.string().optional(), data: z.unknown() }).parse(req.body);
    const parsed = parseGhsFile(body.data);
    if (parsed.kind === 'settings') {
      throw new GhsImportError('This is a GHS settings file; export the game or a data dump instead');
    }
    const room = await hub.room(id);
    const imported = campaignFromGhs(parsed.game, parsed.kind === 'datadump' ? parsed.settings : undefined);
    const state = {
      ghs: imported.ghs,
      ext: { ...room.state.ext, crossoverPerksToVerify: imported.ext.crossoverPerksToVerify, rules: imported.ext.rules ?? room.state.ext.rules }
    };
    await db.insert(imports).values({ campaignId: id, filename: body.filename, kind: parsed.kind, raw: body.data as object, createdBy: req.user!.id });
    if (parsed.kind === 'datadump' && parsed.settings) {
      await db.update(campaigns).set({ ghsSettings: parsed.settings }).where(eq(campaigns.id, id));
    }
    const revision = await room.replaceState(req.user!, 'system.import', state, `Imported GHS ${parsed.kind}${body.filename ? ` from ${body.filename}` : ''}`);
    return { revision };
  });

  app.get('/api/campaigns/:id/export', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { format } = z.object({ format: z.enum(['game', 'datadump']).default('game') }).parse(req.query);
    const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
    if (!campaign) {
      return reply.code(404).send({ error: 'Campaign not found' });
    }
    const date = new Date().toISOString().slice(0, 10);
    const body = format === 'game' ? exportGhsGame(campaign.state) : exportGhsDatadump(campaign.state, campaign.ghsSettings ?? undefined);
    const filename = format === 'game' ? `ghs-game_${slug(campaign.name)}_${date}.json` : `ghs-data-dump_${slug(campaign.name)}_${date}.json`;
    return reply.header('content-disposition', `attachment; filename="${filename}"`).type('application/json').send(JSON.stringify(body));
  });

  app.get('/api/campaigns/:id/events', async (req) => {
    const { id } = idParams.parse(req.params);
    const { limit, before } = z
      .object({ limit: z.coerce.number().int().min(1).max(500).default(100), before: z.coerce.number().int().optional() })
      .parse(req.query);
    const rows = await db
      .select({
        revision: events.revision,
        type: events.type,
        log: events.log,
        userId: events.userId,
        userName: users.displayName,
        playSessionId: events.playSessionId,
        undoneAt: events.undoneAt,
        createdAt: events.createdAt
      })
      .from(events)
      .leftJoin(users, eq(users.id, events.userId))
      .where(before ? and(eq(events.campaignId, id), lt(events.revision, before)) : eq(events.campaignId, id))
      .orderBy(desc(events.revision))
      .limit(limit);
    return rows;
  });

  app.get('/api/campaigns/:id/sessions', async (req) => {
    const { id } = idParams.parse(req.params);
    return db.select().from(playSessions).where(eq(playSessions.campaignId, id)).orderBy(desc(playSessions.startedAt));
  });

  app.post('/api/campaigns/:id/sessions', async (req) => {
    const { id } = idParams.parse(req.params);
    const { mode } = z.object({ mode: z.enum(['physical', 'online']) }).parse(req.body);
    const room = await hub.room(id);
    const session = await db.transaction(async (tx) => {
      await tx
        .update(playSessions)
        .set({ endedAt: new Date() })
        .where(and(eq(playSessions.campaignId, id), isNull(playSessions.endedAt)));
      const [created] = await tx.insert(playSessions).values({ campaignId: id, mode, startedBy: req.user!.id }).returning();
      return created!;
    });
    room.setPlaySession(session.id);
    await room.replaceState(req.user!, 'system.sessionStart', { ...room.state, ext: { ...room.state.ext, mode } }, `Started a ${mode} session`);
    return session;
  });

  app.post('/api/campaigns/:id/sessions/end', async (req) => {
    const { id } = idParams.parse(req.params);
    const room = await hub.room(id);
    await db
      .update(playSessions)
      .set({ endedAt: new Date() })
      .where(and(eq(playSessions.campaignId, id), isNull(playSessions.endedAt)));
    await room.replaceState(req.user!, 'system.sessionEnd', room.state, `Ended the ${room.state.ext.mode} session`);
    room.setPlaySession(null);
    return { ok: true };
  });

  app.get('/api/campaigns/:id/ws', { websocket: true }, (socket, req) => {
    const user = req.user!;
    const client: HubClient = {
      user,
      send(message: ServerMessage) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(message));
        }
      }
    };

    // Attach listeners synchronously; messages that arrive while the room loads wait for it.
    const parsedParams = idParams.safeParse(req.params);
    const roomPromise = parsedParams.success ? hub.room(parsedParams.data.id) : Promise.reject(new HubError('Campaign not found', 'not_found'));
    roomPromise.then(
      (room) => {
        room.join(client);
        socket.on('close', () => room.leave(client));
      },
      (error) => socket.close(4404, error instanceof HubError ? error.message : 'not found')
    );

    socket.on('message', async (raw) => {
      let message;
      try {
        message = clientMessage.parse(JSON.parse(raw.toString()));
      } catch {
        client.send({ t: 'reject', id: '', code: 'invalid_message', error: 'Invalid message' });
        return;
      }
      if (message.t === 'ping') {
        client.send({ t: 'pong' });
        return;
      }
      try {
        const room = await roomPromise;
        const revision = message.t === 'cmd' ? await room.dispatch(user, message.type, message.payload) : await room.undo(user);
        client.send({ t: 'ack', id: message.id, revision });
      } catch (error) {
        const { code, error: text } = errorMessage(error);
        if (code === 'internal') {
          req.log.error({ err: error, message }, 'command failed');
        }
        client.send({ t: 'reject', id: message.id, code, error: text });
      }
    });
  });
}
