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
