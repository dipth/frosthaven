import { gameManager, type Game, type GameManager, type GameModel } from '@fh/ghs-core';
import type { z } from 'zod';
import type { CampaignState, ExtState } from './state';

export interface CommandContext {
  userId: string;
  isAdmin: boolean;
}

/** What a command handler gets to work with. GHS state is live in the singletons. */
export interface Runtime {
  gm: GameManager;
  game: Game;
  ext: ExtState;
  /** Adds a human-readable line to the session log. */
  log(message: string): void;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly code: 'unknown_command' | 'invalid_payload' | 'forbidden' | 'invalid_state' = 'invalid_state'
  ) {
    super(message);
  }
}

export interface CommandDef<S extends z.ZodType = z.ZodType> {
  type: string;
  payload: S;
  /** Throws CommandError('...', 'forbidden') when ctx may not run this command. */
  authorize?(state: CampaignState, payload: z.infer<S>, ctx: CommandContext): void;
  run(rt: Runtime, payload: z.infer<S>, ctx: CommandContext): void;
}

export function defineCommand<S extends z.ZodType>(def: CommandDef<S>): CommandDef<S> {
  return def;
}

export interface CommandLog {
  /** GHS undo-info entries (label key + args), as GHS records them in before(). */
  ghs: string[][];
  messages: string[];
}

export interface ExecuteResult {
  state: CampaignState;
  log: CommandLog;
}

/** Loads a GameModel into the GHS singletons, starting from fresh figure objects. */
export function loadGhs(model: GameModel) {
  gameManager.stateManager.reset();
  gameManager.game.figures = [];
  gameManager.game.fromModel(structuredClone(model));
}

/** Serializes the GHS singletons to a plain, detached GameModel. */
export function snapshotGhs(): GameModel {
  return JSON.parse(JSON.stringify(gameManager.game.toModel()));
}

export function runCommand<S extends z.ZodType>(
  def: CommandDef<S>,
  state: CampaignState,
  rawPayload: unknown,
  ctx: CommandContext
): ExecuteResult {
  const parsed = def.payload.safeParse(rawPayload);
  if (!parsed.success) {
    throw new CommandError(`${def.type}: ${parsed.error.message}`, 'invalid_payload');
  }
  def.authorize?.(state, parsed.data, ctx);

  loadGhs(state.ghs);
  const ext = structuredClone(state.ext);
  const messages: string[] = [];
  def.run({ gm: gameManager, game: gameManager.game, ext, log: (m) => messages.push(m) }, parsed.data, ctx);

  return {
    state: { ghs: snapshotGhs(), ext },
    log: { ghs: gameManager.stateManager.drainActionLog(), messages }
  };
}
