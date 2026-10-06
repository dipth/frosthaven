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
