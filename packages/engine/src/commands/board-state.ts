/**
 * Online mode: board state helpers shared by the board commands and the
 * health/death commands (kept apart from both to avoid an import cycle).
 */
import type { Monster } from '@fh/ghs-core';
import type { MonsterEntity } from '@fh/ghs-core/vendor/game/model/MonsterEntity';
import { MonsterType } from '@fh/ghs-core/vendor/game/model/data/MonsterType';
import { SummonState } from '@fh/ghs-core/vendor/game/model/Summon';
import { CommandError, type Runtime } from '../runtime';
import type { EntityRef } from './play';

/** Stable key of a figure on the board. */
export function boardKey(ref: EntityRef): string {
  switch (ref.kind) {
    case 'character':
      return `character:${ref.edition}:${ref.name}`;
    case 'summon':
      return `summon:${ref.edition}:${ref.name}:${ref.uuid}`;
    case 'monster':
      return `monster:${ref.edition}:${ref.name}:${ref.number}`;
    case 'objective':
      return `objective:${ref.uuid}:${ref.number}`;
  }
}

export function board(rt: Runtime) {
  const scenario = rt.game.scenario;
  if (!scenario) throw new CommandError('No scenario is running');
  if (!rt.ext.board || rt.ext.board.scenario !== scenario.index) {
    rt.ext.board = { scenario: scenario.index, positions: {}, removed: [] };
  }
  return rt.ext.board;
}

/**
 * A monster standee was removed: take it off the map and, for a normal or
 * elite monster that wasn't summoned, drop a loot token in its hex.
 */
export function monsterDied(rt: Runtime, figure: Monster, entity: MonsterEntity) {
  const b = rt.ext.board;
  if (!b || b.scenario !== rt.game.scenario?.index) return;
  const key = boardKey({ kind: 'monster', edition: figure.edition, name: figure.name, number: entity.number });
  const at = b.positions[key];
  if (!at) return;
  delete b.positions[key];
  if (entity.type !== MonsterType.boss && entity.summon === SummonState.false) {
    b.loot = [...(b.loot ?? []), at];
  }
}
