import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, expect, it } from 'vitest';
import { executeCommand, newCampaignState, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown = {}, ctx = admin) => executeCommand(state, type, payload, ctx).state;
const drifter = { kind: 'character', edition: 'fh', name: 'drifter' };

beforeAll(async () => {
  await bootstrapGhsNode();
});

it('tracks figure positions and removed items for the current scenario', () => {
  let state = run(newCampaignState('x'), 'character.add', { edition: 'fh', name: 'drifter' });
  state = run(state, 'character.add', { edition: 'fh', name: 'blinkblade' });
  state = run(state, 'character.setOwner', { edition: 'fh', name: 'drifter', userId: 'alice' });
  expect(() => run(state, 'board.move', { ref: drifter, hex: { x: 1, y: 2 } })).toThrow(/No scenario/);
  state = run(state, 'scenario.set', { index: '1' });
  expect(() => run(state, 'board.move', { ref: drifter, hex: { x: 1, y: 2 } }, { userId: 'bob', isAdmin: false })).toThrow();
  state = run(state, 'board.move', { ref: drifter, hex: { x: 1, y: 2 } }, { userId: 'alice', isAdmin: false });
  expect(state.ext.board).toMatchObject({ scenario: '1', positions: { 'character:fh:drifter': { x: 1, y: 2 } } });
  expect(() => run(state, 'board.move', { ref: { ...drifter, name: 'blinkblade' }, hex: { x: 1, y: 2 } })).toThrow(/already standing/);
  state = run(state, 'board.place', {
    placements: [
      { ref: { ...drifter, name: 'blinkblade' }, hex: { x: 1, y: 2 } },
      { ref: { kind: 'monster', edition: 'fh', name: 'hound', number: 1 }, hex: { x: 3, y: 3 } }
    ]
  });
  expect(state.ext.board!.positions['character:fh:blinkblade']).toBeUndefined();
  expect(state.ext.board!.positions['monster:fh:hound:1']).toEqual({ x: 3, y: 3 });
  state = run(state, 'board.toggleItem', { id: '0:4', removed: true });
  expect(state.ext.board!.removed).toEqual(['0:4']);
  state = run(state, 'finish.start', { success: false });
  state = run(state, 'finish.apply', {});
  expect(state.ext.board).toBeUndefined();
});

it('drops a loot token where a normal or elite monster dies', () => {
  let state = run(newCampaignState('x'), 'character.add', { edition: 'fh', name: 'drifter' });
  state = run(state, 'scenario.set', { index: '1' });
  state = run(state, 'monster.addStandee', { edition: 'fh', name: 'algox-archer', type: 'normal', number: 1 });
  state = run(state, 'monster.addStandee', { edition: 'fh', name: 'algox-archer', type: 'normal', number: 2, summon: true });
  const archer = (number: number) => ({ kind: 'monster', edition: 'fh', name: 'algox-archer', number });
  state = run(state, 'board.place', {
    placements: [
      { ref: archer(1), hex: { x: 3, y: 3 } },
      { ref: archer(2), hex: { x: 4, y: 3 } }
    ]
  });
  state = run(state, 'entity.changeHealth', { targets: [archer(1)], delta: -99 });
  expect(state.ext.board!.loot).toEqual([{ x: 3, y: 3 }]);
  expect(state.ext.board!.positions['monster:fh:algox-archer:1']).toBeUndefined();
  // Summoned monsters drop nothing.
  state = run(state, 'entity.kill', { targets: [archer(2)] });
  expect(state.ext.board!.loot).toEqual([{ x: 3, y: 3 }]);
  expect(state.ext.board!.positions['monster:fh:algox-archer:2']).toBeUndefined();
  state = run(state, 'board.pickUpLoot', { index: 0 });
  expect(state.ext.board!.loot).toEqual([]);
  expect(() => run(state, 'board.pickUpLoot', { index: 0 })).toThrow(/No loot/);
});

it('places, moves and removes large character tokens on hexes', () => {
  let state = run(newCampaignState('x'), 'character.add', { edition: 'fh', name: 'deathwalker' });
  state = run(state, 'character.setOwner', { edition: 'fh', name: 'deathwalker', userId: 'alice' });
  state = run(state, 'scenario.set', { index: '1' });
  const alice = { userId: 'alice', isAdmin: false };
  const bob = { userId: 'bob', isAdmin: false };
  const deathwalker = { edition: 'fh', name: 'deathwalker' };
  expect(() => run(state, 'board.addCharacterToken', { character: deathwalker, hex: { x: 1, y: 1 } }, bob)).toThrow();
  state = run(state, 'board.addCharacterToken', { character: deathwalker, hex: { x: 1, y: 1 } }, alice);
  state = run(state, 'board.addCharacterToken', { character: deathwalker, hex: { x: 2, y: 1 } }, alice);
  expect(() => run(state, 'board.addCharacterToken', { character: deathwalker, hex: { x: 1, y: 1 } }, alice)).toThrow(/already/);
  const [first, second] = state.ext.board!.characterTokens!;
  expect(first).toMatchObject({ edition: 'fh', name: 'deathwalker', hex: { x: 1, y: 1 } });
  expect(() => run(state, 'board.moveCharacterToken', { id: first!.id, hex: { x: 2, y: 1 } }, alice)).toThrow(/already/);
  expect(() => run(state, 'board.moveCharacterToken', { id: first!.id, hex: { x: 3, y: 1 } }, bob)).toThrow();
  state = run(state, 'board.moveCharacterToken', { id: first!.id, hex: { x: 3, y: 1 } }, alice);
  expect(state.ext.board!.characterTokens!.map((t) => t.hex)).toEqual([{ x: 3, y: 1 }, { x: 2, y: 1 }]);
  state = run(state, 'board.moveCharacterToken', { id: second!.id, hex: null }, alice);
  expect(state.ext.board!.characterTokens!.map((t) => t.id)).toEqual([first!.id]);
});
