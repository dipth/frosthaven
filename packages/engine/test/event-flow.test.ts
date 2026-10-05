import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, describe, expect, it } from 'vitest';
import { effectText, executeCommand, newCampaignState, type CampaignState } from '../src';
import { gameManager } from '@fh/ghs-core';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown = {}) => executeCommand(state, type, payload, admin).state;

beforeAll(async () => {
  await bootstrapGhsNode();
});

function withCharacters(): CampaignState {
  let state = run(newCampaignState('x'), 'character.add', { edition: 'fh', name: 'blinkblade' });
  state = run(state, 'character.add', { edition: 'fh', name: 'banner-spear' });
  return state;
}

/** Puts a card on top of a deck. */
function onTop(state: CampaignState, type: string, cardId: string): CampaignState {
  const rest = state.ghs.party.eventDecks[type]!.filter((id) => id !== cardId);
  if (rest.length === state.ghs.party.eventDecks[type]!.length) {
    state = run(state, 'events.addCard', { type, cardId, position: 'top' });
    return state;
  }
  return run(state, 'events.reorder', { type, cardIds: [cardId, ...rest] });
}

describe('event draw', () => {
  it('draws, preselects outcomes and resolves an outpost event', () => {
    let state = onTop(withCharacters(), 'summer-outpost', 'SO-05');
    state = run(state, 'eventDraw.start', { type: 'summer-outpost' });
    expect(state.ext.eventDraft).toMatchObject({ type: 'summer-outpost', cardId: 'SO-05', selected: -1 });

    // Option A: "lose 10 collective gold" can't be resolved automatically, so "otherwise" is preselected.
    state = run(state, 'eventDraw.select', { option: 0 });
    expect(state.ext.eventDraft!.subSelections).toEqual([1]);
    // The group pays the gold anyway: pick the first outcome by hand.
    state = run(state, 'eventDraw.toggleOutcome', { option: 0, outcome: 0, force: true });
    state = run(state, 'eventDraw.toggleOutcome', { option: 0, outcome: 1 });
    expect(state.ext.eventDraft!.subSelections).toEqual([0]);

    const morale = state.ghs.party.morale;
    state = run(state, 'eventDraw.accept');
    expect(state.ext.eventDraft).toBeUndefined();
    expect(state.ghs.party.morale).toBe(morale + 1);
    expect(state.ghs.party.eventDecks['summer-outpost']).not.toContain('SO-05');
    expect(state.ghs.party.eventCards.at(-1)).toMatchObject({ cardId: 'SO-05', selected: 0, subSelections: [0] });
    // The gold payment is a condition the group handles by hand.
    expect(state.ext.eventFollowUps?.[0]?.manual[0]).toMatchObject({ kind: 'condition', value: { type: 'loseCollectiveGold' } });
  });

  it('redraws and cancels', () => {
    let state = onTop(withCharacters(), 'summer-road', 'SR-01');
    state = run(state, 'eventDraw.start', { type: 'summer-road' });
    state = run(state, 'eventDraw.redraw');
    expect(state.ext.eventDraft!.cardId).not.toBe('SR-01');
    expect(state.ghs.party.eventDecks['summer-road']).toContain('SR-01');
    state = run(state, 'eventDraw.cancel');
    expect(state.ext.eventDraft).toBeUndefined();
  });

  it('renders effect texts without placeholders', () => {
    const card = gameManager.eventCardManager.getEventCardForEdition('fh', 'winter-outpost', 'WO-01')!;
    const texts = card.options.flatMap((o) => o.outcomes.flatMap((outcome) => (outcome.effects ?? []).map((e) => effectText(e, 'fh'))));
    expect(texts).toContain('-5 Attack');
    expect(texts.join(' ')).not.toMatch(/%|\{\d\}/);
  });
});

describe('outpost attack', () => {
  it('runs the attack from a winter outpost event', () => {
    let state = withCharacters();
    state = run(state, 'party.setSoldiers', { value: 2 });
    state = onTop(state, 'winter-outpost', 'WO-01');
    state = run(state, 'eventDraw.start', { type: 'winter-outpost' });
    state = run(state, 'eventDraw.select', { option: 0 });
    expect(state.ext.eventDraft!.attack).toBe(true);
    state = run(state, 'eventDraw.accept');
    const followUp = state.ext.eventFollowUps![0]!;
    expect(followUp.outpostAttack?.attack?.attackValue).toBe(30);
    expect(followUp.outpostAttack?.effects[0]).toMatchObject({ type: 'outpostAttack', values: [-5] });

    state = run(state, 'outpostAttack.start', { followUp: 0 });
    const attack = state.ext.outpostAttack!;
    expect(attack).toMatchObject({ attackValue: 25, targetNumber: 5, attacks: 0 });
    // Even-numbered buildings only.
    const ids = attack.order.map((name) => gameManager.campaignManager.campaignData().buildings.find((b) => b.name === name)!.id);
    expect(ids.every((id) => +id % 2 === 0)).toBe(true);

    state = run(state, 'outpostAttack.setSoldiers', { soldiers: 1 });
    state = run(state, 'outpostAttack.draw');
    expect(state.ext.outpostAttack!.result).toBeDefined();
    state = run(state, 'outpostAttack.resolve');
    expect(state.ext.outpostAttack!.attacks).toBe(1);
    expect(state.ghs.party.soldiers).toBe(1);
    state = run(state, 'outpostAttack.resolve', { state: 'damaged' });
    const second = state.ext.outpostAttack!.order[1]!;
    expect(state.ghs.party.buildings.find((b) => b.name === second)!.state).toBe('damaged');

    state = run(state, 'outpostAttack.finish');
    expect(state.ext.outpostAttack).toBeUndefined();
    expect(state.ext.eventFollowUps?.some((f) => f.outpostAttack)).toBeFalsy();
  });
});
