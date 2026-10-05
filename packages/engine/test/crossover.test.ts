import { bootstrapGhsNode, gameManager } from '@fh/ghs-core/node';
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  campaignFromGhs,
  exportGhsGame,
  fillPerksFromTop,
  parseGhsFile,
  playableClasses,
  rawClassData,
  type CampaignState
} from '../src';

const dump = '../../fixtures/private/ghs-data-dump-2026-10-04T14_19_49.846Z.json';

beforeAll(async () => {
  await bootstrapGhsNode();
});

describe('crossover classes', () => {
  it('offers the 17 Frosthaven classes and the 23 official crossover classes', () => {
    const classes = playableClasses(gameManager).map((c) => `${c.edition}:${c.name}`);
    expect(classes.filter((c) => c.startsWith('fh:'))).toHaveLength(17);
    expect(classes.filter((c) => !c.startsWith('fh:'))).toHaveLength(23);
    expect(classes).toEqual(expect.arrayContaining(['gh:brute', 'gh:envx', 'fc:diviner', 'jotl:hatchet']));
  });

  it('uses the official sheet data, including corrections to GHS', () => {
    const spellweaver = rawClassData({ edition: 'gh', name: 'spellweaver' })!;
    expect(spellweaver.perks![6]!.cards![1]!.attackModifier).toMatchObject({ type: 'plus1', effects: [{ type: 'condition', value: 'stun' }] });
    expect(gameManager.getCharacterData('music-note', 'gh').traits).toEqual(['educated', 'nimble', 'persuasive']);
    expect(gameManager.getCharacterData('sun', 'gh').perks).toHaveLength(10);
  });

  it('fills checkmarks from the top', () => {
    expect(fillPerksFromTop([1, 2, 2, 1], 4)).toEqual([1, 2, 1, 0]);
    expect(fillPerksFromTop([1, 1], 5)).toEqual([1, 1]);
  });
});

describe.skipIf(!existsSync(dump))('the group\'s Secretariat data', () => {
  let state: CampaignState;

  beforeAll(() => {
    const parsed = parseGhsFile(JSON.parse(readFileSync(dump, 'utf8')));
    if (parsed.kind === 'settings') {
      throw new Error('fixture is not a game');
    }
    state = campaignFromGhs(parsed.game);
  });

  it('keeps crossover characters as Gloomhaven-edition characters and flags guessed perks', () => {
    expect(state.ghs.characters.map((c) => `${c.edition}:${c.name}`)).toEqual(['fh:banner-spear', 'fh:deathwalker', 'gh:angry-face', 'gh:sun']);
    expect(state.ext.crossoverPerksToVerify).toEqual(['gh:angry-face', 'gh:sun']);
    const sun = state.ghs.characters.find((c) => c.name === 'sun')!;
    // Two checkmarks in GHS' Gloomhaven list become the first two boxes of the official list.
    expect(sun.progress!.perks.slice(0, 3)).toEqual([1, 1, 0]);
  });

  it('exports official perks into notes and restores them exactly', () => {
    const sun = state.ghs.characters.find((c) => c.name === 'sun')!;
    sun.progress!.perks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 2]; // Shielding Light, both boxes
    const exported = exportGhsGame(state);
    const exportedSun = exported.characters.find((c) => c.name === 'sun')!;
    expect(exportedSun.progress!.perks.slice(0, 3)).toEqual([2, 0, 0]);
    expect(exportedSun.progress!.notes).toContain('fh-crossover-perks: 0,0,0,0,0,0,0,0,0,2');
    expect(exportedSun.progress!.notes).toContain('Shielding Light');

    const reimported = campaignFromGhs(exported);
    const back = reimported.ghs.characters.find((c) => c.name === 'sun')!;
    expect(back.progress!.perks.slice(0, 10)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 2]);
    expect(back.progress!.notes).not.toContain('fh-crossover-perks');
    // Both were flagged when exported; the guess survives the round trip, still flagged.
    expect(reimported.ext.crossoverPerksToVerify).toEqual(['gh:angry-face', 'gh:sun']);
    state.ext.crossoverPerksToVerify = ['gh:angry-face'];
    expect(campaignFromGhs(exportGhsGame(state)).ext.crossoverPerksToVerify).toEqual(['gh:angry-face']);
  });

  it('round-trips non-crossover data unchanged', () => {
    const reimported = campaignFromGhs(exportGhsGame(state));
    const strip = (s: CampaignState) => {
      const { revision: _r, characters, ...rest } = s.ghs;
      return { ...rest, characters: characters.filter((c) => c.edition === 'fh') };
    };
    expect(strip(reimported)).toEqual(strip(state));
  });
});
