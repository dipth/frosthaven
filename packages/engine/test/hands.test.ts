import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { gameManager } from '@fh/ghs-core';
import { beforeAll, expect, it } from 'vitest';
import { cardSlots, executeCommand, HIDDEN_CARD, newCampaignState, projectFor, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };
const run = (state: CampaignState, type: string, payload: unknown = {}, ctx = admin) => executeCommand(state, type, payload, ctx).state;
const drifter = { edition: 'fh', name: 'drifter' };
const blinkblade = { edition: 'fh', name: 'blinkblade' };

beforeAll(async () => {
  await bootstrapGhsNode();
});

function cards(name: string) {
  return gameManager.decksData('fh').find((d) => d.name === name)!.abilities.filter((a) => a.level === 1).map((a) => a.cardId!);
}

function setup(): CampaignState {
  let state = newCampaignState('x');
  state.ext.mode = 'online';
  state = run(state, 'character.add', drifter);
  state = run(state, 'character.add', blinkblade);
  state = run(state, 'character.setOwner', { ...drifter, userId: 'alice' });
  state = run(state, 'character.setOwner', { ...blinkblade, userId: 'bob' });
  state = run(state, 'scenario.set', { index: '1' });
  state = run(state, 'hands.setup', { ...drifter, cards: cards('drifter') }, alice);
  state = run(state, 'hands.setup', { ...blinkblade, cards: cards('blinkblade') }, bob);
  return state;
}

it('keeps card choices secret until everyone reveals', () => {
  let state = setup();
  const [a, b] = cards('drifter');
  expect(() => run(state, 'hands.select', { ...drifter, cards: [a, b] }, bob)).toThrow(/another player/);
  state = run(state, 'hands.select', { ...drifter, cards: [a, b], leading: b }, alice);

  const bobView = projectFor(state, 'bob');
  expect(bobView.ext.hands!['fh:drifter']!.selected).toEqual([HIDDEN_CARD, HIDDEN_CARD]);
  expect(bobView.ext.hands!['fh:drifter']!.hand.every((c) => c === HIDDEN_CARD)).toBe(true);
  expect(projectFor(state, 'alice').ext.hands!['fh:drifter']!.selected).toEqual([a, b]);

  expect(() => run(state, 'hands.reveal')).toThrow(/Waiting for Blinkblade/);
  const [c, d] = cards('blinkblade');
  state = run(state, 'hands.select', { ...blinkblade, cards: [c, d] }, bob);
  state = run(state, 'hands.reveal');
  expect(state.ghs.state).toBe('next');
  const drifterFigure = state.ghs.characters.find((x) => x.name === 'drifter')!;
  const leading = gameManager.decksData('fh').find((x) => x.name === 'drifter')!.abilities.find((x) => x.cardId === b)!;
  expect(drifterFigure.initiative).toBe(leading.initiative);
  expect(projectFor(state, 'bob').ext.hands!['fh:drifter']!.selected).toEqual([a, b]);

  state = run(state, 'hands.play', { ...drifter, cardId: a, to: 'discard' }, alice);
  state = run(state, 'hands.play', { ...drifter, cardId: b, to: 'lost' }, alice);
  expect(state.ext.hands!['fh:drifter']).toMatchObject({ discard: [a], lost: [b], selected: [] });
});

it('rests and loses cards to negate damage', () => {
  let state = setup();
  const [a, b, c, d] = cards('drifter');
  for (const id of [a, b, c]) state = run(state, 'hands.move', { ...drifter, cardId: id, to: 'discard' }, alice);
  state = run(state, 'hands.shortRest', drifter, alice);
  const h = state.ext.hands!['fh:drifter']!;
  expect(h.lost).toHaveLength(1);
  expect(h.discard).toHaveLength(0);
  state = run(state, 'hands.negateDamage', { ...drifter, from: 'hand', cards: [d] }, alice);
  expect(state.ext.hands!['fh:drifter']!.lost).toContain(d);
});

it('tracks use slots on active cards and gains their experience', () => {
  let state = setup();
  const crushingWeight = gameManager.decksData('fh').find((d) => d.name === 'drifter')!.abilities.find((a) => a.name === 'Crushing Weight')!;
  expect(cardSlots(crushingWeight).map((s) => s.xp)).toEqual([1, 0, 1, 0, 1, 0]);
  const id = crushingWeight.cardId!;
  const mark = (delta: 1 | -1) => (state = run(state, 'hands.mark', { ...drifter, cardId: id, delta }, alice));
  expect(() => mark(1)).toThrow(/active cards/);
  state = run(state, 'hands.move', { ...drifter, cardId: id, to: 'active' }, alice);
  const xp = () => state.ghs.characters.find((x) => x.name === 'drifter')!.experience;
  mark(1);
  expect(xp()).toBe(1);
  mark(1);
  mark(1);
  expect(state.ext.hands!['fh:drifter']!.counters![id]).toBe(3);
  expect(xp()).toBe(2);
  mark(-1);
  expect(xp()).toBe(1);
  expect(() => run(state, 'hands.mark', { ...drifter, cardId: id, delta: 1 }, bob)).toThrow(/another player/);
  for (let i = 0; i < 4; i++) mark(1);
  expect(() => mark(1)).toThrow(/already marked/);
  state = run(state, 'hands.move', { ...drifter, cardId: id, to: 'lost' }, alice);
  expect(state.ext.hands!['fh:drifter']!.counters![id]).toBeUndefined();
});

it('hides battle goals and personal quests from other players', () => {
  let state = setup();
  state = run(state, 'battleGoals.deal', drifter, alice);
  expect(state.ghs.characters.find((x) => x.name === 'drifter')!.battleGoals).toHaveLength(3);
  state = run(state, 'battleGoals.choose', { ...drifter, index: 2 }, alice);
  state = run(state, 'character.setPersonalQuest', { ...drifter, cardId: '581' }, alice);
  const bobView = projectFor(state, 'bob').ghs.characters.find((x) => x.name === 'drifter')!;
  expect(bobView.battleGoals).toEqual([]);
  expect(bobView.progress!.personalQuest).toBe('');
  expect(projectFor(state, 'alice').ghs.characters.find((x) => x.name === 'drifter')!.progress!.personalQuest).toBe('581');
});

it('drops hands when the scenario ends', () => {
  let state = setup();
  state = run(state, 'finish.start', { success: false });
  state = run(state, 'finish.apply', {});
  expect(state.ext.hands).toBeUndefined();
});

it('stores a deck between scenarios and plays it', () => {
  let state = newCampaignState('x');
  state.ext.mode = 'online';
  state = run(state, 'character.add', drifter);
  state = run(state, 'character.setOwner', { ...drifter, userId: 'alice' });
  const deck = cards('drifter').slice(0, 8);
  expect(() => run(state, 'deck.set', { ...drifter, cards: deck }, bob)).toThrow(/another player/);
  expect(() => run(state, 'deck.set', { ...drifter, cards: [...deck, 99999] }, alice)).toThrow(/aren't available/);
  state = run(state, 'deck.set', { ...drifter, cards: deck }, alice);
  expect(state.ext.decks!['fh:drifter']).toEqual(deck);
  expect(projectFor(state, 'bob').ext.decks!['fh:drifter']).toBeUndefined();

  state = run(state, 'scenario.set', { index: '1' });
  expect(() => run(state, 'deck.set', { ...drifter, cards: deck.slice(1) }, alice)).toThrow(/between scenarios/);
  expect(() => run(state, 'hands.setup', { ...drifter, cards: deck.slice(0, 1) }, alice)).toThrow(/at least two cards/);
  state = run(state, 'hands.setup', drifter, alice);
  expect(state.ext.hands!['fh:drifter']!.hand).toEqual(deck);
  expect(state.ext.scenarioDecks).toBeUndefined();
});

it('keeps a temporary deck across resets until the scenario closes', () => {
  let state = setup();
  const stored = cards('drifter').slice(0, 8);
  const temporary = cards('drifter').slice(2, 10);
  state = run(state, 'finish.start', { success: false });
  state = run(state, 'finish.apply', {});
  state = run(state, 'deck.set', { ...drifter, cards: stored }, alice);
  state = run(state, 'scenario.set', { index: '1' });
  state = run(state, 'hands.setup', { ...drifter, cards: temporary }, alice);
  expect(state.ext.scenarioDecks!['fh:drifter']).toEqual(temporary);
  expect(state.ext.decks!['fh:drifter']).toEqual(stored);

  state = run(state, 'scenario.reset');
  expect(state.ext.hands).toBeUndefined();
  expect(state.ext.scenarioDecks!['fh:drifter']).toEqual(temporary);
  state = run(state, 'hands.setup', drifter, alice);
  expect(state.ext.hands!['fh:drifter']!.hand).toEqual(stored);

  state = run(state, 'finish.start', { success: false });
  state = run(state, 'finish.apply', {});
  expect(state.ext.scenarioDecks).toBeUndefined();
  expect(state.ext.decks!['fh:drifter']).toEqual(stored);
});

it('drops the deck of a retired character', () => {
  let state = newCampaignState('x');
  state = run(state, 'character.add', drifter);
  state = run(state, 'deck.set', { ...drifter, cards: cards('drifter').slice(0, 4) });
  state = run(state, 'character.setAside', drifter);
  expect(state.ext.decks!['fh:drifter']).toHaveLength(4);
  state = run(state, 'character.bringBack', drifter);
  state = run(state, 'character.retire', drifter);
  expect(state.ext.decks!['fh:drifter']).toBeUndefined();
});
