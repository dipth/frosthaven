import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, expect, it } from 'vitest';
import { executeCommand, newCampaignState, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown = {}) => executeCommand(state, type, payload, admin).state;
const drifter = { edition: 'fh', name: 'drifter' };

beforeAll(async () => {
  await bootstrapGhsNode();
});

it('retires a character with personal quest rewards', () => {
  let state = run(newCampaignState('x'), 'character.add', drifter);
  state = run(state, 'character.setPersonalQuest', { ...drifter, cardId: '581' });
  state = run(state, 'character.setResource', { ...drifter, type: 'lumber', value: 3 });
  state = run(state, 'character.retireStart', drifter);
  const draft = state.ext.retirement!;
  expect(draft).toMatchObject({ character: 'fh:drifter', personalQuest: '581', envelopeBuilding: 'garden' });
  expect(draft.conclusions.map((c) => c.section)).toContain('48.3');

  state = run(state, 'character.retireConfirm');
  expect(state.ext.retirement).toBeUndefined();
  expect(state.ghs.characters.some((c) => c.name === 'drifter')).toBe(false);
  expect(state.ghs.party.retirements.map((r) => r.name)).toContain('drifter');
  expect(state.ghs.party.loot.lumber).toBe(3);
  expect(state.ghs.party.buildings.find((b) => b.name === 'garden')?.level).toBe(0);
  expect(state.ext.pendingConclusions?.map((p) => p.section)).toContain('48.3');
});
