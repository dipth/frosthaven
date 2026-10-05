import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { gameManager, Character } from '@fh/ghs-core';
import { beforeAll, expect, it } from 'vitest';
import { enhancementCost, executeCommand, loadGhs, newCampaignState, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown = {}) => executeCommand(state, type, payload, admin).state;
const bb = { edition: 'fh', name: 'blinkblade' };
const progress = (state: CampaignState) => state.ghs.characters.find((c) => c.name === 'blinkblade')!.progress!;

beforeAll(async () => {
  await bootstrapGhsNode();
});

function setup(): CampaignState {
  let state = run(newCampaignState('x'), 'character.add', bb);
  return run(state, 'character.setGold', { ...bb, gold: 200 });
}

function character(state: CampaignState) {
  loadGhs(state.ghs, state.ext.rules);
  return gameManager.game.figures.find((f): f is Character => f instanceof Character)!;
}

it('prices enhancements like the FH cost table', () => {
  const state = setup();
  const c = character(state);
  const level1 = gameManager.deckData(c).abilities.find((a) => a.level === 1)!;
  // +1 move: 30; +1 attack on a multi-target ability: 100; lost halves; persistent triples.
  expect(enhancementCost(c, { cardId: level1.cardId!, half: 'top', enhancement: 'plus1', base: 'move' as never })).toBe(30);
  expect(enhancementCost(c, { cardId: level1.cardId!, half: 'top', enhancement: 'plus1', base: 'attack' as never, multiTarget: true })).toBe(100);
  expect(enhancementCost(c, { cardId: level1.cardId!, half: 'top', enhancement: 'poison' as never, special: 'lost' })).toBe(25);
  expect(enhancementCost(c, { cardId: level1.cardId!, half: 'top', enhancement: 'hex', hexes: 2 })).toBe(100);
});

it('enhances a card for gold, more expensive the second time', () => {
  let state = setup();
  const c = character(state);
  const level1 = gameManager.deckData(c).abilities.find((a) => a.level === 1)!;
  const payload = { ...bb, cardId: level1.cardId, half: 'top', enhancement: 'plus1', base: 'move' };
  // No enhancer built in a new outpost.
  expect(() => run(state, 'character.enhance', payload)).toThrow(/enhancer/);
  state = run(state, 'building.add', { name: 'enhancer' });
  state = run(state, 'building.upgrade', { name: 'enhancer' });
  state = run(state, 'character.enhance', payload);
  expect(progress(state).gold).toBe(170);
  state = run(state, 'character.enhance', { ...payload, slot: 1 });
  expect(progress(state).gold).toBe(170 - 105);
  expect(progress(state).enhancements).toHaveLength(2);
  // Already on the physical card: recorded for free.
  state = run(state, 'character.enhance', { ...payload, half: 'bottom', record: true });
  expect(progress(state).gold).toBe(65);
});

it('picks ability cards at level-up', () => {
  let state = setup();
  const c = character(state);
  const level2 = gameManager.deckData(c).abilities.find((a) => a.level === 2)!;
  const level3 = gameManager.deckData(c).abilities.find((a) => a.level === 3)!;
  expect(() => run(state, 'character.pickCard', { ...bb, cardId: level2.cardId })).toThrow(/level up first/);
  state = run(state, 'character.setLevel', { ...bb, level: 2 });
  expect(() => run(state, 'character.pickCard', { ...bb, cardId: level3.cardId })).toThrow(/level 2 or lower/);
  state = run(state, 'character.pickCard', { ...bb, cardId: level2.cardId });
  expect(progress(state).deck).toHaveLength(1);
  state = run(state, 'character.unpickCard', { ...bb, cardId: level2.cardId });
  expect(progress(state).deck).toHaveLength(0);
});
