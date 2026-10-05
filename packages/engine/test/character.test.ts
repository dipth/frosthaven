import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { beforeAll, describe, expect, it } from 'vitest';
import { CommandError, executeCommand, exportGhsGame, newCampaignState, type CampaignState } from '../src';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };
const run = (state: CampaignState, type: string, payload: unknown, ctx = alice) => executeCommand(state, type, payload, ctx).state;
const sun = { edition: 'gh', name: 'sun' };

let base: CampaignState;
beforeAll(async () => {
  await bootstrapGhsNode();
  base = run(newCampaignState('x'), 'character.add', { ...sun, level: 1 });
});

describe('character sheet', () => {
  it('only lets the owner edit their character', () => {
    expect(() => run(base, 'character.setGold', { ...sun, gold: 10 }, bob)).toThrow(/belongs to another player/);
    expect(run(base, 'character.setGold', { ...sun, gold: 10 }).ghs.characters[0]!.progress!.gold).toBe(10);
  });

  it('levels up through experience and unlocks perk checkmarks', () => {
    let state = run(base, 'character.setXP', { ...sun, experience: 50 });
    const c = state.ghs.characters[0]!;
    expect(c.progress!.experience).toBe(50);
    state = run(state, 'character.setLevel', { ...sun, level: 2 });
    state = run(state, 'character.setPerk', { ...sun, index: 9, value: 1 });
    expect(state.ghs.characters[0]!.progress!.perks[9]).toBe(1);
    // Level 2 gives one checkmark; a second costs more than available.
    expect(() => run(state, 'character.setPerk', { ...sun, index: 9, value: 2 })).toThrow(/No perk checkmarks/);
  });

  it('exports official crossover perks into notes', () => {
    let state = run(base, 'character.setExtraPerks', { ...sun, value: 2 });
    state = run(state, 'character.setPerk', { ...sun, index: 9, value: 2 });
    const exported = exportGhsGame(state).characters[0]!;
    expect(exported.progress!.notes).toContain('Shielding Light');
    expect(exported.progress!.perks.slice(0, 2)).toEqual([2, 0]);
  });

  it('tracks masteries and rejects unknown ones', () => {
    const state = run(base, 'character.toggleMastery', { ...sun, index: 1 });
    expect(state.ghs.characters[0]!.progress!.masteries).toEqual([1]);
    expect(() => run(base, 'character.toggleMastery', { ...sun, index: 4 })).toThrow(CommandError);
  });

  it('retires a character into the party sheet', () => {
    const state = run(base, 'character.retire', sun);
    expect(state.ghs.characters).toEqual([]);
    expect(state.ghs.party.retirements.map((c) => c.name)).toEqual(['sun']);
  });
});
