/**
 * Import/export of Gloomhaven Secretariat files. Mirrors the detection rules
 * of GHS' data management import: a GameModel has a numeric `revision`,
 * Settings have a numeric `zoom`, and a data dump has `game` + `settings`
 * (or the legacy localStorage keys `ghs-game` + `ghs-settings`).
 */
import { Settings, type GameModel } from '@fh/ghs-core';
import { crossoverFromGhs, crossoverToGhs } from './crossover';
import { loadGhs, snapshotGhs } from './runtime';
import { emptyExt, type CampaignState } from './state';

export type GhsImport =
  | { kind: 'game'; game: GameModel }
  | { kind: 'datadump'; game: GameModel; settings: Record<string, unknown> | undefined }
  | { kind: 'settings'; settings: Record<string, unknown> };

export class GhsImportError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGameModel(value: unknown): value is GameModel {
  return isRecord(value) && typeof value['revision'] === 'number';
}

export function parseGhsFile(json: unknown): GhsImport {
  if (!isRecord(json)) {
    throw new GhsImportError('Not a GHS file: expected a JSON object');
  }
  if (isGameModel(json)) {
    return { kind: 'game', game: json };
  }
  if (typeof json['zoom'] === 'number') {
    return { kind: 'settings', settings: json };
  }
  const game = json['game'] ?? json['ghs-game'];
  const settings = json['settings'] ?? json['ghs-settings'];
  if (isGameModel(game)) {
    return { kind: 'datadump', game, settings: isRecord(settings) ? settings : undefined };
  }
  throw new GhsImportError('Not a GHS game export or data dump');
}

/**
 * Runs a GameModel through GHS' own fromModel/toModel so legacy fields are
 * migrated exactly as GHS would on load.
 */
export function normalizeGameModel(game: GameModel): GameModel {
  loadGhs(game);
  return snapshotGhs();
}

export function campaignFromGhs(game: GameModel): CampaignState {
  const converted = structuredClone(game);
  const unverified = crossoverFromGhs(converted);
  const ext = emptyExt();
  if (unverified.length) {
    ext.crossoverPerksToVerify = unverified;
  }
  return { ghs: normalizeGameModel(converted), ext };
}

export function exportGhsGame(state: CampaignState): GameModel {
  const game = structuredClone(state.ghs);
  crossoverToGhs(game, state.ext.crossoverPerksToVerify);
  game.revision = (game.revision ?? 0) + 1;
  game.server = false;
  return game;
}

/**
 * A full data dump in GHS' format. `settings` should be the settings from the
 * dump the campaign was imported from, so importing back into GHS doesn't reset
 * the user's GHS preferences.
 */
export function exportGhsDatadump(state: CampaignState, settings: Record<string, unknown> | undefined) {
  return {
    game: exportGhsGame(state),
    settings: settings ?? JSON.parse(JSON.stringify(new Settings())),
    undo: [],
    redo: [],
    'undo-infos': [],
    'game-backup': []
  };
}
