import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, expect, it } from 'vitest';
import { executeCommand, newCampaignState, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown) => executeCommand(state, type, payload, admin).state;

beforeAll(async () => {
  await bootstrapGhsNode();
});

it('builds, edits and reorders an event deck', () => {
  let state = run(newCampaignState('x'), 'events.buildDeck', { type: 'summer-road' });
  const deck = state.ghs.party.eventDecks['summer-road']!;
  expect(deck.length).toBeGreaterThan(10);
  expect(() => run(state, 'events.buildDeck', { type: 'summer-road' })).toThrow(/already has cards/);

  const [first, ...rest] = deck;
  state = run(state, 'events.removeCard', { type: 'summer-road', cardId: first });
  expect(state.ghs.party.eventDecks['summer-road']).not.toContain(first);
  state = run(state, 'events.addCard', { type: 'summer-road', cardId: first, position: 'bottom' });
  expect(state.ghs.party.eventDecks['summer-road']!.at(-1)).toBe(first);

  state = run(state, 'events.reorder', { type: 'summer-road', cardIds: [first, ...rest] });
  expect(state.ghs.party.eventDecks['summer-road']).toEqual([first, ...rest]);
  expect(() => run(state, 'events.reorder', { type: 'summer-road', cardIds: rest })).toThrow(/exactly the cards/);
});

it('records outpost buildings', () => {
  let state = newCampaignState('x');
  const initial = state.ghs.party.buildings.map((b) => `${b.name}:${b.level}`);
  state = run(state, 'building.add', { name: 'barracks' });
  state = run(state, 'building.upgrade', { name: 'barracks' });
  const barracks = state.ghs.party.buildings.find((b) => b.name === 'barracks')!;
  expect(barracks.level).toBe(1);
  state = run(state, 'building.setState', { name: 'barracks', state: 'damaged' });
  expect(state.ghs.party.buildings.find((b) => b.name === 'barracks')!.state).toBe('damaged');
  expect(initial).toBeDefined();
});
