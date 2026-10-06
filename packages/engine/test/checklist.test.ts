import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, expect, it } from 'vitest';
import { executeCommand, newCampaignState, physicalChecklist, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown = {}) => executeCommand(state, type, payload, admin).state;
const drifter = { edition: 'fh', name: 'drifter' };

beforeAll(async () => {
  await bootstrapGhsNode();
});

it('lists what to change in the box after an online session', () => {
  let state = run(newCampaignState('x'), 'character.add', drifter);
  const baseline = structuredClone(state);
  state = run(state, 'character.setGold', { ...drifter, gold: 25 });
  state = run(state, 'character.setResource', { ...drifter, type: 'hide', value: 2 });
  state = run(state, 'party.setMorale', { value: 6 });
  state = run(state, 'party.setWeek', { value: 2 });
  state = run(state, 'building.upgrade', { name: 'mining-camp' });
  const top = state.ghs.party.eventDecks['summer-road']![0]!;
  state = run(state, 'eventDraw.start', { type: 'summer-road' });
  state = run(state, 'eventDraw.select', { option: 0 });
  state = run(state, 'eventDraw.accept');
  const items = physicalChecklist(baseline.ghs, state.ghs);
  const texts = items.map((i) => i.text);
  expect(texts.some((t) => t.startsWith('Drifter: gold 25 ('))).toBe(true);
  expect(texts).toContain('Drifter: 2 hide (+2)');
  expect(texts.some((t) => /^Set morale to 6/.test(t))).toBe(true);
  expect(texts).toContain('Mark weeks 1–2 on the calendar');
  expect(texts).toContain('Mining Camp: build level 1');
  expect(texts.some((t) => t.includes(top))).toBe(true);
  // Ids are stable between computations.
  expect(physicalChecklist(baseline.ghs, state.ghs).map((i) => i.id)).toEqual(items.map((i) => i.id));
  expect(physicalChecklist(state.ghs, state.ghs)).toEqual([]);

  state = run(state, 'checklist.tick', { id: items[0]!.id, done: true });
  expect(state.ext.checklistTicks).toEqual([items[0]!.id]);
});
