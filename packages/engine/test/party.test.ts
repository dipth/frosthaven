import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { campaignFromGhs, CommandError, executeCommand, newCampaignState, parseGhsFile, type CampaignState } from '../src';

const admin = { userId: 'a', isAdmin: true };
const run = (state: CampaignState, type: string, payload: unknown) => executeCommand(state, type, payload, admin);
const dump = '../../fixtures/private/ghs-data-dump-2026-10-04T14_19_49.846Z.json';

beforeAll(async () => {
  await bootstrapGhsNode();
});

describe('party sheet', () => {
  it('logs GHS undo infos and edits simple values', () => {
    const result = run(newCampaignState('x'), 'party.setResource', { type: 'lumber', value: 7 });
    expect(result.state.ghs.party.loot.lumber).toBe(7);
    expect(result.log.ghs).toEqual([['setPartyResource', 'x', 'game.loot.lumber', '7']]);
  });

  it('queues the low morale section when morale drops to 0', () => {
    let state = run(newCampaignState('x'), 'party.setMorale', { value: 0 }).state;
    expect(state.ghs.party.morale).toBe(0);
    expect(state.ext.pendingConclusions).toEqual([{ kind: 'conclusion', section: '126.1', edition: 'fh', reason: 'morale dropped to 0' }]);
    state = run(state, 'conclusion.finish', { section: '126.1' }).state;
    expect(state.ext.pendingConclusions).toEqual([]);
    expect(state.ghs.party.conclusions.map((c) => c.index)).toContain('126.1');
  });

  it('applies calendar sections when weeks pass', () => {
    const state = run(newCampaignState('x'), 'party.setWeek', { value: 5 }).state;
    expect(state.ghs.party.weeks).toBe(5);
    // 32.3 has no GHS data: it becomes a reminder to read the section.
    expect(state.ext.pendingConclusions).toEqual([{ kind: 'read', section: '32.3', edition: 'fh', reason: 'calendar week 5' }]);
  });

  it('limits campaign stickers to the number in the box', () => {
    let state = newCampaignState('x');
    state = run(state, 'party.addCampaignSticker', { sticker: 'bug-in-a-jar' }).state;
    expect(() => run(state, 'party.addCampaignSticker', { sticker: 'bug-in-a-jar' })).toThrow(CommandError);
    expect(() => run(state, 'party.addCampaignSticker', { sticker: 'nonsense' })).toThrow(/Unknown campaign sticker/);
  });

  it('manages the item supply', () => {
    let state = run(newCampaignState('x'), 'party.addUnlockedItem', { id: 1 }).state;
    expect(state.ghs.party.unlockedItems).toEqual([{ name: '1', edition: 'fh', count: -1 }]);
    expect(() => run(state, 'party.addUnlockedItem', { id: '1' })).toThrow(/already in the supply/);
    state = run(state, 'party.removeUnlockedItem', { id: '1' }).state;
    expect(state.ghs.party.unlockedItems).toEqual([]);
  });

  it('maps achievement labels to keys', () => {
    const state = run(newCampaignState('x'), 'party.addAchievement', { kind: 'global', achievement: 'custom thing' }).state;
    expect(state.ghs.party.globalAchievementsList).toEqual(['custom thing']);
  });
});

describe.skipIf(!existsSync(dump))('party sheet on the group\'s campaign', () => {
  let state: CampaignState;
  beforeAll(() => {
    const parsed = parseGhsFile(JSON.parse(readFileSync(dump, 'utf8')));
    if (parsed.kind === 'settings') throw new Error('not a game');
    state = campaignFromGhs(parsed.game);
  });

  it('advances the calendar through manually written week sections', () => {
    expect(state.ghs.party.weeks).toBe(17);
    const next = run(state, 'party.setWeek', { value: 19 }).state;
    const handled = (s: string) => next.ghs.party.conclusions.some((c) => c.index === s) || next.ext.pendingConclusions?.some((c) => c.section === s);
    expect(handled('138.1')).toBe(true);
  });
});
