import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, expect, it } from 'vitest';
import { executeCommand, newCampaignState, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown = {}) => executeCommand(state, type, payload, admin).state;
const none = { lumber: 0, metal: 0, hide: 0, inspiration: 0 };
const blinkblade = (pay: Partial<{ gold: number; lumber: number; metal: number; hide: number }>) => ({
  character: 'fh:blinkblade',
  gold: 0,
  lumber: 0,
  metal: 0,
  hide: 0,
  ...pay
});

beforeAll(async () => {
  await bootstrapGhsNode();
});

function setup(): CampaignState {
  let state = run(newCampaignState('x'), 'character.add', { edition: 'fh', name: 'blinkblade' });
  state = run(state, 'character.setGold', { edition: 'fh', name: 'blinkblade', gold: 20 });
  state = run(state, 'character.setResource', { edition: 'fh', name: 'blinkblade', type: 'hide', value: 2 });
  for (const [type, value] of [['lumber', 6], ['metal', 4], ['hide', 0]] as const) {
    state = run(state, 'party.setResource', { type, value });
  }
  return state;
}

const level = (state: CampaignState, name: string) => state.ghs.party.buildings.find((b) => b.name === name)?.level;

it('builds the mining camp from the supply and a character, after prosperity allows it', () => {
  let state = setup();
  // Mining camp: prosperity 1, 4 lumber, 2 metal, 1 hide, 10 gold.
  const payment = { party: { ...none, lumber: 4, metal: 2 }, characters: [blinkblade({ gold: 10, hide: 1 })] };
  // Prosperity level 1 makes it available to build.
  expect(level(state, 'mining-camp')).toBe(0);

  expect(() => run(state, 'building.construct', { name: 'mining-camp', payment: { ...payment, characters: [blinkblade({ gold: 10 })] } })).toThrow(
    /1 material missing/
  );
  state = run(state, 'building.construct', { name: 'mining-camp', payment });
  expect(level(state, 'mining-camp')).toBe(1);
  expect(state.ghs.party.loot).toMatchObject({ lumber: 2, metal: 2 });
  const character = state.ghs.characters.find((f) => f.name === 'blinkblade') as unknown as { progress: { gold: number; loot: Record<string, number> } };
  expect(character.progress.gold).toBe(10);
  expect(character.progress.loot['hide']).toBe(1);
});

it('lets inspiration replace missing materials and the carpenter waive one', () => {
  let state = setup();
  state = run(state, 'party.setProsperity', { value: 10 });
  state = run(state, 'party.setInspiration', { value: 1 });
  // No hide in the supply: inspiration pays for it.
  const payment = { party: { lumber: 4, metal: 2, hide: 0, inspiration: 1 }, characters: [blinkblade({ gold: 10 })] };
  state = run(state, 'building.construct', { name: 'mining-camp', payment });
  expect(state.ghs.party.inspiration).toBe(0);
  expect(() => run(state, 'building.construct', { name: 'barracks', payment })).toThrow(/upgraded through the campaign/);
});

it('repairs with morale or materials and recruits soldiers', () => {
  let state = setup();
  state = run(state, 'party.setMorale', { value: 5 });
  state = run(state, 'building.setState', { name: 'barracks', state: 'damaged' });
  const morale = state.ghs.party.morale;
  state = run(state, 'building.repair', { name: 'barracks', morale: true });
  expect(state.ghs.party.morale).toBe(morale - 1);
  expect(state.ghs.party.buildings.find((b) => b.name === 'barracks')!.state).toBe('normal');

  state = run(state, 'building.setState', { name: 'barracks', state: 'damaged' });
  // Barracks level 1 repair: any 2 materials.
  expect(() => run(state, 'building.repair', { name: 'barracks', payment: { party: { ...none, lumber: 1 }, characters: [] } })).toThrow(/missing/);
  state = run(state, 'building.repair', { name: 'barracks', payment: { party: { ...none, lumber: 1, metal: 1 }, characters: [] } });
  expect(state.ghs.party.loot).toMatchObject({ lumber: 5, metal: 3 });

  state = run(state, 'party.setSoldiers', { value: 2 });
  const soldiers = state.ghs.party.soldiers;
  const pay = { party: { ...none, metal: 1 }, characters: [blinkblade({ gold: 3 })] };
  state = run(state, 'party.recruitSoldier', { payment: pay });
  expect(state.ghs.party.soldiers).toBe(soldiers + 1);
  expect(state.ghs.party.loot.metal).toBe(2);
  expect(() => run(state, 'party.recruitSoldier', { payment: { ...pay, characters: [blinkblade({ gold: 2 })] } })).toThrow(/exactly 3 gold/);
});
