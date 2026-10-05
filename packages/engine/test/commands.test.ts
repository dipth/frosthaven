import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, describe, expect, it } from 'vitest';
import { CommandError, executeCommand, newCampaignState, type CampaignState } from '../src';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };

function run(state: CampaignState, type: string, payload: unknown, ctx = alice) {
  return executeCommand(state, type, payload, ctx).state;
}

describe('engine commands', () => {
  beforeAll(async () => {
    await bootstrapGhsNode();
  });

  it('plays a round of scenario 1 through commands', () => {
    let state = newCampaignState('The Frozen Few');
    state = run(state, 'character.add', { edition: 'fh', name: 'drifter' });
    state = run(state, 'character.add', { edition: 'fh', name: 'banner-spear' }, bob);
    expect(state.ext.characterOwners).toEqual({ 'fh:drifter': 'alice', 'fh:banner-spear': 'bob' });

    state = run(state, 'scenario.set', { index: '1' });
    expect(state.ghs.scenario?.index).toBe('1');
    expect(state.ghs.monsters.length).toBeGreaterThan(0);

    expect(() => run(state, 'round.next', {})).toThrow(CommandError);
    state = run(state, 'character.initiative', { edition: 'fh', name: 'drifter', initiative: 12 });
    expect(() => run(state, 'character.initiative', { edition: 'fh', name: 'banner-spear', initiative: 40 })).toThrow(/another player/);
    state = run(state, 'character.initiative', { edition: 'fh', name: 'banner-spear', initiative: 40 }, bob);

    const result = executeCommand(state, 'round.next', {}, alice);
    expect(result.state.ghs.state).toBe('next');
    expect(result.state.ghs.round).toBe(1);
    expect(result.log.ghs).toEqual([['draw']]);
    // the input state is untouched
    expect(state.ghs.state).toBe('draw');
  });

  it('adds an official crossover class', () => {
    let state = newCampaignState('Crossover');
    state = run(state, 'character.add', { edition: 'gh', name: 'brute' });
    expect(state.ghs.characters[0]).toMatchObject({ name: 'brute', edition: 'gh' });
  });

  it('rejects classes without an official crossover sheet', () => {
    expect(() => run(newCampaignState('x'), 'character.add', { edition: 'fh-crossover', name: 'beetle' })).toThrow(/Unknown character class/);
    expect(() => run(newCampaignState('x'), 'character.add', { edition: 'fh-crossover', name: 'brute' })).toThrow(/Unknown character class/);
  });
});
