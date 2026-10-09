import { Game, type GameModel } from '@fh/ghs-core';
import type { EventCardAttack, EventCardAttackTarget, EventCardCondition, EventCardEffect } from '@fh/ghs-core/vendor/game/model/data/EventCard';
import type { NarrationCue } from './narration';
import type { CampaignRules } from './rules';

export type SessionMode = 'physical' | 'online';

/** State that GHS has no notion of. Never exported to GHS. */
export interface ExtState {
  version: 1;
  /** Mode of the current (or last) play session. */
  mode: SessionMode;
  /** Character key (`edition:name`) -> user id of the player controlling it. */
  characterOwners: Record<string, string>;
  /** User who receives actionable Forteller narration cues. */
  narratorUserId?: string;
  /**
   * Crossover characters (`edition:name`) whose official-sheet perks were
   * guessed on import and should be checked against the physical sheet.
   */
  crossoverPerksToVerify?: string[];
  /**
   * Sections the group must read and resolve (GHS would open its conclusion
   * dialog here): prosperity/morale thresholds, calendar weeks, town guard perks.
   */
  pendingConclusions?: PendingConclusion[];
  /** Logic-affecting GHS settings for this campaign (see rules.ts). */
  rules?: CampaignRules;
  /** The event card being resolved, shared by all clients (GHS event-card-draw dialog). */
  eventDraft?: EventDraft;
  /** What's left to do after resolving event cards (GHS event results in the entities menu). */
  eventFollowUps?: EventFollowUp[];
  /** A running outpost attack (GHS outpost-attack dialog). */
  outpostAttack?: OutpostAttackState;
  /** A retirement being reviewed before it's applied (GHS retirement dialog). */
  retirement?: RetirementDraft;
  /** The outpost phase the group is going through, step by step. */
  outpostPhase?: OutpostPhase;
  /** Recent Forteller narration cues not yet dismissed by the narrator. */
  narration?: NarrationCue[];
  /** Each character's stored deck of ability cards (key `edition:name`, GHS cardIds), changed between scenarios. */
  decks?: Record<string, number[]>;
  /**
   * Temporary decks picked for the current scenario instead of the stored
   * one. Kept when the scenario is reset, dropped when it closes.
   */
  scenarioDecks?: Record<string, number[]>;
  /** Online mode: each character's ability cards during a scenario (key `edition:name`). */
  hands?: Record<string, HandState>;
  /** Online mode: what's on the hex map of the current scenario. */
  board?: BoardState;
  /** Physical sync checklist items (ids) already done at the box. */
  checklistTicks?: string[];
}

export interface Hex {
  x: number;
  y: number;
}

export interface BoardState {
  /** Scenario index the board belongs to. */
  scenario: string;
  /** Figure positions by board key (see boardKey). */
  positions: Record<string, Hex>;
  /** Board items (from the scenario's board data) taken off the map: looted tokens, opened doors... */
  removed: string[];
  /** Loot tokens dropped by dead monsters. */
  loot?: Hex[];
  /** Large character tokens placed in hexes (e.g. Deathwalker's shadows). */
  characterTokens?: CharacterToken[];
}

export interface CharacterToken {
  id: string;
  /** The character the token belongs to. */
  edition: string;
  name: string;
  hex: Hex;
}

export type CardPile = 'hand' | 'discard' | 'lost' | 'active';

/** A character's ability cards in an online scenario. Card ids are GHS ability cardIds. */
export interface HandState {
  hand: number[];
  discard: number[];
  lost: number[];
  /** Persistent and round bonuses in play. */
  active: number[];
  /** Use slots marked on active cards (card id -> slots used, see cardSlots). */
  counters?: Record<number, number>;
  /** The two cards chosen for this round (hidden from others until revealed). */
  selected: number[];
  /** Card whose initiative counts. */
  leading?: number;
  /** Long rest instead of playing cards this round. */
  longRest?: boolean;
  /** Choices are shown to everyone (initiatives set). */
  revealed?: boolean;
}

export const OUTPOST_PHASE_STEPS = ['passage-of-time', 'outpost-event', 'building-operations', 'downtime', 'construction'] as const;
export type OutpostPhaseStep = (typeof OUTPOST_PHASE_STEPS)[number];

export interface OutpostPhase {
  step: OutpostPhaseStep;
  /** Calendar week when the phase started (passage of time advances it). */
  startWeek: number;
  /** Outpost event drawn this phase, if any. */
  event?: { type: string; cardId: string };
}

export interface ScenarioRef {
  index: string;
  edition: string;
  group?: string;
}

export interface ItemRef {
  id: number | string;
  edition: string;
}

/**
 * What retiring a character will do, with the random draws fixed up front.
 * 'manual' means the group draws from the physical deck (random draws off).
 */
export interface RetirementDraft {
  character: string;
  personalQuest?: string;
  /** Character and personal quest conclusion sections to resolve afterwards. */
  conclusions: { section: string; edition: string; reason: string }[];
  /** Class unlocked by the personal quest (edition:name), if not unlocked yet. */
  unlockCharacter?: string;
  unlockEvent?: string;
  unlockPQ?: string;
  /** The PQ's class was already unlocked: a random scenario and item design instead. */
  characterReward?: { scenario?: ScenarioRef | 'manual'; item?: ItemRef | 'manual' };
  /** FH envelope building unlocked by the personal quest. */
  envelopeBuilding?: string;
  /** The PQ's envelope was already opened: a random section and blueprint (or +1 inspiration each). */
  envelopeReward?: { section?: ScenarioRef | 'manual'; item?: ItemRef | 'manual' };
  alreadyRetired: boolean;
}

export interface EventDraft {
  edition: string;
  type: string;
  cardId: string;
  selected: number;
  subSelections: number[];
  checks: number[];
  attack: boolean;
}

export interface EventFollowUp {
  edition: string;
  type: string;
  cardId: string;
  /** Effects and conditions the app can't apply; the group applies them by hand. */
  manual: { kind: 'effect' | 'condition'; value: EventCardEffect | EventCardCondition }[];
  /** Collective gains/losses and items to hand out (GHS event distribution dialog). */
  distribution: EventCardEffect[];
  /** Outpost attack to run: the card's attack and attack/target modifiers. */
  outpostAttack?: { attack?: EventCardAttack; effects: EventCardEffect[] };
}

export interface OutpostAttackState {
  /** Event card the attack comes from, if any. */
  source?: { type: string; cardId: string };
  /** Attack value before soldiers. */
  attackValue: number;
  targetNumber: number;
  targetDescription?: string;
  target?: EventCardAttackTarget;
  /** Building names in the order they're attacked (eligible ones first). */
  order: string[];
  /** Number of buildings attacked so far. */
  attacks: number;
  /** Soldiers defending the current target. */
  soldiers: number;
  /** Town guard draw for the current target (GHS AttackResult). */
  result?: { index: number; chooseOffset: number; value: number; stringified: string; type: string };
  log: { building: string; state: 'normal' | 'damaged' | 'wrecked'; result?: number; soldiers: number }[];
}

export interface PendingConclusion {
  /**
   * 'conclusion': has GHS data and is resolved with conclusion.finish;
   * 'read': a section to read from the book (no data), dismissed when done.
   */
  kind: 'conclusion' | 'read';
  section: string;
  edition: string;
  reason: string;
  /** Calendar week the section was triggered by, if any. */
  week?: number;
}

export interface CampaignState {
  ghs: GameModel;
  ext: ExtState;
}

export function emptyExt(): ExtState {
  return { version: 1, mode: 'physical', characterOwners: {} };
}

export function characterKey(character: { edition: string; name: string }) {
  return `${character.edition}:${character.name}`;
}

/** A brand-new Frosthaven campaign. */
export function newCampaignState(partyName: string): CampaignState {
  const game = new Game();
  game.edition = 'fh';
  game.party.edition = 'fh';
  game.party.name = partyName;
  game.party.campaignMode = true;
  return { ghs: JSON.parse(JSON.stringify(game.toModel())), ext: emptyExt() };
}
