import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, expect, it } from 'vitest';
import { executeCommand, newCampaignState, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown = {}) => executeCommand(state, type, payload, admin).state;

beforeAll(async () => {
  await bootstrapGhsNode();
});

it('plants, flips and harvests the garden as weeks pass', () => {
  let state = run(newCampaignState('x'), 'building.add', { name: 'garden' });
  state = run(state, 'building.upgrade', { name: 'garden' });
  state = run(state, 'party.setResource', { type: 'rockroot', value: 1 });
  state = run(state, 'garden.plant', { slot: 0, herb: 'rockroot' });
  expect(state.ghs.party.garden?.plots).toEqual(['rockroot']);
  expect(state.ghs.party.loot.rockroot).toBe(0);
  expect(() => run(state, 'garden.plant', { slot: 1, herb: 'rockroot' })).toThrow(/plot/);
  // A week passes: the level 1 garden flips to its harvest side and (automated) yields its herbs.
  state = run(state, 'party.passWeek');
  expect(state.ghs.party.weeks).toBe(1);
  expect(state.ghs.party.garden?.flipped).toBe(true);
  expect(state.ghs.party.loot.rockroot).toBe(1);
});

it('keeps pets in the stables with one active', () => {
  let state = run(newCampaignState('x'), 'building.add', { name: 'stables' });
  expect(() => run(state, 'pets.add', { id: '01' })).toThrow(/no stables/);
  state = run(state, 'building.upgrade', { name: 'stables' });
  state = run(state, 'pets.add', { id: '01' });
  state = run(state, 'pets.add', { id: '02' });
  state = run(state, 'pets.rename', { id: '01', petname: 'Bacon' });
  state = run(state, 'pets.toggleActive', { id: '01' });
  state = run(state, 'pets.toggleActive', { id: '02' });
  expect(state.ghs.party.pets.map((p) => [p.name, p.petname, p.active])).toEqual([
    ['01', 'Bacon', false],
    ['02', '', true]
  ]);
});
