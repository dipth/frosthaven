import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, expect, it } from 'vitest';
import { executeCommand, newCampaignState, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const player = { userId: 'p', isAdmin: false };
const run = (state: CampaignState, type: string, payload: unknown = {}, ctx = admin) => executeCommand(state, type, payload, ctx).state;

beforeAll(async () => {
  await bootstrapGhsNode();
});

it('cues the scenario introduction, sections and events', () => {
  let state = run(newCampaignState('x'), 'character.add', { edition: 'fh', name: 'drifter' });
  state = run(state, 'scenario.set', { index: '1' });
  expect(state.ext.narration?.map((c) => c.search)).toContain('Scenario 001 Introduction');

  state = run(state, 'narration.dismiss', {});
  expect(state.ext.narration).toBeUndefined();

  state = run(state, 'scenario.reset');
  expect(state.ext.narration).toBeUndefined();

  state = run(state, 'eventDraw.start', { type: 'summer-road' });
  expect(state.ext.narration?.at(-1)?.title).toMatch(/^Summer Road Event SR-\d+/);
});

it('lets only the narrator dismiss cues', () => {
  let state = run(newCampaignState('x'), 'narration.setNarrator', { userId: 'n' });
  state = run(state, 'narration.cue', { kind: 'section', ref: '12.3' });
  expect(state.ext.narration?.[0]).toMatchObject({ title: 'Section 12.3', search: 'Section 12.3' });
  expect(() => run(state, 'narration.dismiss', {}, player)).toThrow(/narrator/);
  state = run(state, 'narration.dismiss', { id: state.ext.narration![0]!.id }, { userId: 'n', isAdmin: false });
  expect(state.ext.narration).toBeUndefined();
});
