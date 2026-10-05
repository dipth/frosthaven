import { Game, type GameModel } from '@fh/ghs-core';

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
