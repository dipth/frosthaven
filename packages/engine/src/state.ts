import { Game, type GameModel } from '@fh/ghs-core';
import type { EventCardAttack, EventCardAttackTarget, EventCardCondition, EventCardEffect } from '@fh/ghs-core/vendor/game/model/data/EventCard';
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
