import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, expect, it } from 'vitest';
import { brewResult, executeCommand, newCampaignState, type CampaignState } from '../src';
import { LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown = {}) => executeCommand(state, type, payload, admin).state;
const bb = { edition: 'fh', name: 'blinkblade' };
const progress = (state: CampaignState) => state.ghs.characters.find((c) => c.name === 'blinkblade')!.progress!;
const items = (state: CampaignState) => progress(state).items.map((i) => i.name);

beforeAll(async () => {
  await bootstrapGhsNode();
});

function setup(): CampaignState {
  let state = run(newCampaignState('x'), 'character.add', bb);
  state = run(state, 'character.setGold', { ...bb, gold: 30 });
  return state;
}

it('buys and sells items from the supply', () => {
  let state = setup();
  // Prosperity 1 items are in the supply from the start; later ones aren't.
  expect(() => run(state, 'item.buy', { ...bb, id: 130 })).toThrow(/item supply/);
  state = run(state, 'item.buy', { ...bb, id: 120 });
  expect(items(state)).toContain('120');
  const gold = progress(state).gold;
  expect(gold).toBeLessThan(30);
  expect(() => run(state, 'item.buy', { ...bb, id: 120 })).toThrow(/can't buy/);
  state = run(state, 'item.sell', { ...bb, id: 120 });
  expect(items(state)).not.toContain('120');
  expect(progress(state).gold).toBe(gold + 7);
});

it('crafts items from resources', () => {
  let state = setup();
  // Shovel: 1 lumber, 1 metal.
  state = run(state, 'party.addUnlockedItem', { id: 57 });
  state = run(state, 'character.setResource', { ...bb, type: 'metal', value: 1 });
  expect(() => run(state, 'item.craft', { ...bb, id: 57 })).toThrow(/Blinkblade.* can't craft/);
  state = run(state, 'character.setResource', { ...bb, type: 'lumber', value: 2 });
  state = run(state, 'item.craft', { ...bb, id: 57 });
  expect(items(state)).toContain('57');
  expect(progress(state).loot).toMatchObject({ metal: 0, lumber: 1 });
});

it('brews potions, unlocking new recipes', () => {
  expect(brewResult([LootType.rockroot, LootType.arrowvine])?.id).toBe(83);
  expect(brewResult([LootType.rockroot, LootType.rockroot])?.id).toBe(98);
  let state = setup();
  state = run(state, 'character.setResource', { ...bb, type: 'arrowvine', value: 1 });
  state = run(state, 'party.setResource', { type: 'rockroot', value: 2 });
  const payload = {
    brewer: 'fh:blinkblade',
    recipient: 'fh:blinkblade',
    recipe: ['arrowvine', 'rockroot'],
    spend: { character: { arrowvine: 1 }, party: { rockroot: 1 } }
  };
  expect(() => run(state, 'item.brew', { ...payload, spend: { character: { arrowvine: 1 }, party: {} } })).toThrow(/exactly 1 rockroot/);
  state = run(state, 'item.brew', payload);
  expect(items(state)).toContain('83');
  expect(state.ghs.party.unlockedItems.some((i) => i.name === '83')).toBe(true);
  expect(state.ghs.party.loot.rockroot).toBe(1);
  expect(progress(state).loot.arrowvine).toBe(0);
});
