import { gameManager, type Game, type GameManager, type GameModel } from '@fh/ghs-core';
import type { z } from 'zod';
import { BuildingModel } from '@fh/ghs-core/vendor/game/model/Building';
import { addCues, detectNarration } from './narration';
import { applyRules, sessionRules, type CampaignRules } from './rules';
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
export function loadGhs(model: GameModel, rules?: CampaignRules) {
  applyRules(rules);
  gameManager.stateManager.reset();
  gameManager.game.figures = [];
  gameManager.game.fromModel(structuredClone(model));
  refreshDerived();
}

/**
 * Derived manager state GHS recomputes on every UI change (GhsManager
 * onUiChangeUpdate): first round flag, enhancer level, alchemist/garden
 * availability, etc. Only the non-mutating part of that hook.
 */
export function refreshDerived() {
  const game = gameManager.game;
  gameManager.roundManager.firstRound = game.round === 0 && game.roundResets.length === 0 && game.roundResetsHidden.length === 0;
  gameManager.buildingsManager.update();
  gameManager.challengesManager.update();
  gameManager.trialsManager.update();
  gameManager.enhancementsManager.update();
  gameManager.imbuementManager.update();
  syncOutpostBuildings();
}

/**
 * GHS src/app/ui/figures/party/buildings/buildings.ts updateBuildings(): the
 * starting buildings are built (level 1, rewards applied) and buildings
 * unlocked by prosperity are listed (level 0).
 */
function syncOutpostBuildings() {
  const game = gameManager.game;
  if (!game.party.campaignMode || !gameManager.fhRules()) return;
  const campaign = gameManager.campaignManager.campaignData();
  if (!campaign?.buildings) return;
  for (const data of campaign.buildings) {
    if (gameManager.buildingsManager.initialBuilding(data) && !game.party.buildings.some((m) => m.name === data.name)) {
      game.party.buildings.push(new BuildingModel(data.name, 1));
      if (data.rewards?.[0]) gameManager.buildingsManager.applyRewards(data.rewards[0]);
    }
  }
  for (const data of campaign.buildings) {
    if (
      data.prosperityUnlock &&
      data.costs.prosperity <= gameManager.campaignManager.prosperityLevel() &&
      !game.party.buildings.some((m) => m.name === data.name) &&
      (!data.requires || game.party.buildings.some((m) => m.name === data.requires && m.level))
    ) {
      game.party.buildings.push(new BuildingModel(data.name, 0));
    }
  }
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

  loadGhs(state.ghs, sessionRules(state.ext));
  const ext = structuredClone(state.ext);
  const messages: string[] = [];
  def.run({ gm: gameManager, game: gameManager.game, ext, log: (m) => messages.push(m) }, parsed.data, ctx);
  refreshDerived();

  if (!gameManager.game.scenario) {
    // Hands and the board only exist during a scenario.
    delete ext.hands;
    delete ext.board;
  }
  const next: CampaignState = { ghs: snapshotGhs(), ext };
  addCues(
    ext,
    detectNarration(state, next, (_kind, index) => gameManager.scenarioData(gameManager.currentEdition()).find((s) => s.index === index && !s.group)?.name)
  );
  return {
    state: next,
    log: { ghs: gameManager.stateManager.drainActionLog(), messages }
  };
}
