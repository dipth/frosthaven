/**
 * Party / campaign sheet actions, ported from GHS
 * src/app/ui/figures/party/party-sheet-dialog.ts (AGPL-3.0). Each command
 * mirrors one dialog method: same undo-info key, same manager calls. Where the
 * dialog would open a follow-up dialog (conclusions), we queue a pending
 * conclusion in ext instead, which the group resolves with conclusion.finish.
 */
import { Character, settingsManager } from '@fh/ghs-core';
import { CountIdentifier, Identifier } from '@fh/ghs-core/vendor/game/model/data/Identifier';
import { LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import type { ScenarioData } from '@fh/ghs-core/vendor/game/model/data/ScenarioData';
import { GameScenarioModel, Scenario } from '@fh/ghs-core/vendor/game/model/Scenario';
import { z } from 'zod';
import { ScenarioSummary } from '../ghs-ui/scenario-summary';
import { CommandError, defineCommand, type CommandDef, type Runtime } from '../runtime';

const lootTypes = z.enum(Object.values(LootType) as [LootType, ...LootType[]]);

function party(rt: Runtime) {
  return rt.game.party;
}

function edition(rt: Runtime) {
  return rt.game.edition ?? rt.gm.currentEdition();
}

function campaign(rt: Runtime) {
  return rt.gm.campaignManager.campaignData();
}

function isConclusion(rt: Runtime, section: string, ed: string | undefined = undefined): boolean {
  return party(rt).conclusions.some((m) => ((!ed && m.edition === rt.game.edition) || (ed && m.edition === ed)) && m.index === section);
}

/** Conclusion sections that follow `section` and can be chosen now (GHS openConclusions). */
export function conclusionChoices(rt: Pick<Runtime, 'gm' | 'game'>, section: string): ScenarioData[] {
  return rt.gm
    .sectionData(rt.game.edition)
    .filter(
      (sectionData) =>
        sectionData.conclusion &&
        !sectionData.parent &&
        sectionData.parentSections &&
        sectionData.parentSections.find((parentSections) => parentSections.length === 1 && parentSections.includes(section)) &&
        rt.gm.scenarioManager.getRequirements(sectionData).length === 0
    );
}

/** GHS hasConclusions: section has follow-up conclusions none of which is finished yet. */
function hasConclusions(rt: Runtime, section: string): boolean {
  const conclusions = rt.gm
    .sectionData(rt.game.edition)
    .filter(
      (sectionData) =>
        sectionData.conclusion &&
        !sectionData.parent &&
        sectionData.parentSections &&
        sectionData.parentSections.find((parentSections) => parentSections.length === 1 && parentSections.includes(section))
    );
  return (
    conclusions.length > 0 &&
    conclusions.every(
      (conclusion) =>
        !party(rt).conclusions.find((m) => m.edition === conclusion.edition && m.index === conclusion.index && m.group === conclusion.group)
    )
  );
}

/** Where GHS opens the conclusion dialog, queue it for the group to resolve. */
export function queueConclusion(rt: Runtime, section: string, reason: string, week?: number, kind: 'conclusion' | 'read' = 'conclusion') {
  const pending = (rt.ext.pendingConclusions ??= []);
  if (!pending.some((p) => p.section === section)) {
    pending.push({ kind, section, edition: edition(rt), reason, ...(week !== undefined ? { week } : {}) });
    rt.log(`Read section ${section} (${reason})`);
  }
}

/** GHS finishConclusion(index): either asks to choose a follow-up conclusion, or opens the summary. */
function finishConclusion(rt: Runtime, section: string, reason: string, force = false) {
  const conclusion = rt.gm.sectionData(edition(rt)).find((s) => s.index === section);
  if (
    conclusion &&
    (force || !party(rt).conclusions.find((v) => v.edition === conclusion.edition && v.group === conclusion.group && v.index === conclusion.index))
  ) {
    queueConclusion(rt, section, reason);
  }
}

function unlockConclusion(rt: Runtime, section: string, reason: string) {
  if (!isConclusion(rt, section)) {
    finishConclusion(rt, section, reason);
  }
}

function moraleDefense(morale: number): number {
  if (morale < 3) return -10;
  if (morale < 5) return -5;
  if (morale < 8) return 0;
  if (morale < 11) return 5;
  if (morale < 14) return 10;
  return 15;
}

function solvedCount(rt: Runtime, sections: string[] | undefined): number {
  let solved = 0;
  while (sections && solved < sections.length && isConclusion(rt, sections[solved]!)) {
    solved++;
  }
  return solved;
}

function rebuildTownGuardDeck(rt: Runtime, keepActive: boolean) {
  const p = party(rt);
  const deck = rt.gm.attackModifierManager.buildTownGuardAttackModifierDeck(p, campaign(rt));
  deck.active = keepActive;
  rt.gm.attackModifierManager.shuffleModifiers(deck);
  p.townGuardDeck = deck.toModel();
}

const text = (max: number) => z.string().max(max);
const count = z.number().int().min(0).max(999);

const commands: CommandDef[] = [
  defineCommand({
    type: 'party.setLocation',
    payload: z.object({ location: text(200) }),
    run(rt, { location }) {
      rt.gm.stateManager.before('setPartyLocation', location);
      party(rt).location = location;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.setNotes',
    payload: z.object({ notes: text(20000) }),
    run(rt, { notes }) {
      rt.gm.stateManager.before('setPartyNotes', notes);
      party(rt).notes = notes;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.setPlayers',
    payload: z.object({ players: z.array(text(40)).max(4) }),
    run(rt, { players }) {
      rt.gm.stateManager.before('setPlayer', players.join(', '));
      party(rt).players = players;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.toggleCampaignMode',
    payload: z.object({}),
    run(rt) {
      rt.gm.stateManager.before(party(rt).campaignMode ? 'disablePartyCampaignMode' : 'enablePartyCampaignMode');
      party(rt).campaignMode = !party(rt).campaignMode;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.setProsperity',
    payload: z.object({ value: count }),
    run(rt, { value }) {
      const p = party(rt);
      rt.gm.stateManager.before('setPartyProsperity', value);
      rt.gm.campaignManager.changeProsperity(value - p.prosperity);
      rt.gm.stateManager.after();
      const sections = campaign(rt).prosperitySections ?? {};
      Object.keys(sections)
        .reverse()
        .forEach((prosperity) => {
          const section = sections[+prosperity]!;
          if (value >= +prosperity && !isConclusion(rt, section)) {
            unlockConclusion(rt, section, `prosperity ${prosperity}`);
          }
        });
    }
  }),
  defineCommand({
    type: 'party.setMorale',
    payload: z.object({ value: z.number().int().min(0).max(20) }),
    run(rt, { value }) {
      const p = party(rt);
      const data = campaign(rt);
      const lowSolved = solvedCount(rt, data.lowMorale);
      const highSolved = solvedCount(rt, data.highMorale);
      rt.gm.stateManager.before('setPartyMorale', value);
      rt.gm.campaignManager.changeMorale(value - p.morale);
      if (value === 0 && data.lowMorale?.length && lowSolved <= data.lowMorale.length) {
        if (lowSolved < data.lowMorale.length) {
          finishConclusion(rt, data.lowMorale[lowSolved]!, 'morale dropped to 0');
        } else {
          const section = data.lowMorale[lowSolved - 1]!;
          p.conclusions = p.conclusions.filter((m) => m.edition !== rt.game.edition || m.index !== section);
          finishConclusion(rt, section, 'morale dropped to 0');
        }
      } else if (value === 20 && data.highMorale?.length && highSolved < data.highMorale.length) {
        finishConclusion(rt, data.highMorale[highSolved]!, 'morale reached 20');
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.setTotalDefense',
    payload: z.object({ total: z.number().int().min(-50).max(200) }),
    run(rt, { total }) {
      const p = party(rt);
      const value = total - moraleDefense(p.morale);
      if (p.defense !== value) {
        rt.gm.stateManager.before('setPartyTotalDefense', p.name, value);
        p.defense = value;
        rt.gm.stateManager.after();
      }
    }
  }),
  defineCommand({
    type: 'party.setSoldiers',
    payload: z.object({ value: z.number().int().min(0).max(20) }),
    run(rt, { value }) {
      // Recruiting through the barracks (paying 3 gold + 1 material) is part of the
      // outpost phase; this sets the count directly like GHS' forced edit.
      rt.gm.stateManager.before('setPartySoldiers', value);
      party(rt).soldiers = value;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.setInspiration',
    payload: z.object({ value: count }),
    run(rt, { value }) {
      const p = party(rt);
      rt.gm.stateManager.before('setPartyInspiration', p.name, value);
      p.inspiration = value;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.setResource',
    payload: z.object({ type: lootTypes, value: count }),
    run(rt, { type, value }) {
      const p = party(rt);
      rt.gm.stateManager.before('setPartyResource', p.name, 'game.loot.' + type, value);
      p.loot[type] = value;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.setWeek',
    payload: z.object({ value: z.number().int().min(0).max(200) }),
    run(rt, { value }) {
      const p = party(rt);
      const fixed = (week: number) => campaign(rt).weeks?.[week + 1] ?? [];
      const manual = (week: number) => p.weekSections?.[week + 1] ?? [];

      // Sections with a choice of follow-up conclusions are queued for the group.
      const choose: string[] = [];
      for (let week = p.weeks; week < value; week++) {
        [...fixed(week), ...manual(week)].forEach((section) => {
          if (hasConclusions(rt, section) && !choose.includes(section)) {
            choose.push(section);
          }
        });
      }
      choose.forEach((section) => queueConclusion(rt, section, `calendar week ${value}`, value));

      rt.gm.stateManager.before('setPartyWeeks', value);
      for (let week = p.weeks; week < value; week++) {
        [...fixed(week), ...manual(week)].forEach((section) => {
          const sectionData = rt.gm.sectionData(rt.game.edition).find((s) => s.index === section && s.conclusion);
          if (
            sectionData &&
            !p.conclusions.find((m) => m.edition === sectionData.edition && m.index === sectionData.index && m.group === sectionData.group)
          ) {
            rt.gm.scenarioManager.finishScenario(new Scenario(sectionData), true, undefined, false, false, false, p.campaignMode, true);
            rt.log(`Calendar: section ${section} applied (week ${week + 1})`);
          } else if (!sectionData && !choose.includes(section)) {
            // No data in GHS: the group reads it from the section book.
            queueConclusion(rt, section, `calendar week ${week + 1}`, undefined, 'read');
          }
        });
      }
      p.weeks = value;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.addWeekSection',
    payload: z.object({ week: z.number().int().min(1).max(200), section: z.string().regex(/^\d+(\.\d+)?$/) }),
    run(rt, { week, section }) {
      const p = party(rt);
      rt.gm.stateManager.before('addPartyWeekSection', week, section);
      p.weekSections[week] = [...(p.weekSections[week] ?? []), section];
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.removeWeekSection',
    payload: z.object({ week: z.number().int().min(1).max(200), section: z.string() }),
    run(rt, { week, section }) {
      const p = party(rt);
      const list = p.weekSections[week] ?? [];
      if (!list.includes(section)) {
        throw new CommandError(`Section ${section} is not in week ${week}`);
      }
      rt.gm.stateManager.before('removePartyWeekSection', week, section);
      p.weekSections[week] = list.filter((s, i) => s !== section || i !== list.indexOf(section));
      if (p.weekSections[week]!.length === 0) {
        delete p.weekSections[week];
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.addAchievement',
    payload: z.object({ kind: z.enum(['party', 'global']), achievement: z.string().min(1).max(200) }),
    run(rt, { kind, achievement }) {
      // Free text is mapped to the achievement key when it matches a known label.
      const labels = settingsManager.label.data?.[kind === 'party' ? 'partyAchievements' : 'globalAchievements'] ?? {};
      const key = Object.keys(labels).find((k) => String(labels[k]).toLowerCase() === achievement.toLowerCase()) ?? achievement;
      rt.gm.stateManager.before(kind === 'party' ? 'addPartyAchievement' : 'addGlobalAchievement', key);
      (kind === 'party' ? party(rt).achievementsList : party(rt).globalAchievementsList).push(key);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.removeAchievement',
    payload: z.object({ kind: z.enum(['party', 'global']), achievement: z.string() }),
    run(rt, { kind, achievement }) {
      const list = kind === 'party' ? party(rt).achievementsList : party(rt).globalAchievementsList;
      const index = list.lastIndexOf(achievement);
      if (index < 0) {
        throw new CommandError(`No ${kind} achievement ${achievement}`);
      }
      rt.gm.stateManager.before(kind === 'party' ? 'removePartyAchievement' : 'removeGlobalAchievement', achievement);
      list.splice(index, 1);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.addCampaignSticker',
    payload: z.object({ sticker: z.string() }),
    run(rt, { sticker }) {
      const p = party(rt);
      const definition = campaign(rt).campaignStickers?.find((s) => s.split(':')[0] === sticker);
      if (!definition) {
        throw new CommandError(`Unknown campaign sticker ${sticker}`, 'invalid_payload');
      }
      const total = definition.includes(':') ? +definition.split(':')[1]! : 1;
      const placed = p.campaignStickers.filter((s) => s.toLowerCase() === sticker).length;
      if (placed >= total) {
        throw new CommandError(`All ${total} "${sticker}" stickers are already placed`);
      }
      rt.gm.stateManager.before('addCampaignSticker', settingsManager.getLabel('data.campaignSticker.' + sticker));
      p.campaignStickers.push(sticker);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.removeCampaignSticker',
    payload: z.object({ sticker: z.string() }),
    run(rt, { sticker }) {
      const p = party(rt);
      const index = p.campaignStickers.indexOf(sticker);
      if (index < 0) {
        throw new CommandError(`Sticker ${sticker} is not placed`);
      }
      rt.gm.stateManager.before('removeCampaignSticker', sticker);
      p.campaignStickers.splice(index, 1);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.setTownGuardPerks',
    payload: z.object({ value: z.number().int().min(0).max(100) }),
    run(rt, { value }) {
      rt.gm.stateManager.before('setPartyTownGuardPerks', value);
      party(rt).townGuardPerks = value;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.toggleTownGuardPerkSection',
    payload: z.object({ section: z.string(), force: z.boolean().default(false) }),
    run(rt, { section, force }) {
      const p = party(rt);
      p.townGuardPerkSections = p.townGuardPerkSections || [];
      const index = p.townGuardPerkSections.indexOf(section);
      if (index === -1 && p.townGuardPerkSections.length >= Math.floor(p.townGuardPerks / 3) && !force) {
        throw new CommandError('Not enough town guard perk checkmarks for another perk');
      }
      rt.gm.stateManager.before(index === -1 ? 'addPartyTownGuardPerkSection' : 'removePartyTownGuardPerkSection', section);
      if (index === -1) {
        p.townGuardPerkSections.push(section);
        finishConclusion(rt, section, 'town guard perk');
      } else {
        p.townGuardPerkSections.splice(index, 1);
      }
      rebuildTownGuardDeck(rt, false);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.addUnlockedItem',
    payload: z.object({ id: z.union([z.string(), z.number()]).transform(String), edition: z.string().default('fh') }),
    run(rt, { id, edition: ed }) {
      const p = party(rt);
      if (p.unlockedItems.some((i) => i.name === id && i.edition === ed)) {
        throw new CommandError(`Item ${id} is already in the supply`);
      }
      const item = rt.gm.itemManager.getItems(ed, true).find((i) => id === '' + i.id);
      if (!item) {
        throw new CommandError(`Unknown item ${ed} ${id}`, 'invalid_payload');
      }
      rt.gm.stateManager.before('addUnlockedItem', ed, id, item.name);
      p.unlockedItems = p.unlockedItems || [];
      p.unlockedItems.push(new CountIdentifier(id, ed));
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.removeUnlockedItem',
    payload: z.object({ id: z.union([z.string(), z.number()]).transform(String), edition: z.string().default('fh') }),
    run(rt, { id, edition: ed }) {
      const p = party(rt);
      const identifier = p.unlockedItems.find((i) => i.name === id && i.edition === ed);
      if (!identifier) {
        throw new CommandError(`Item ${id} is not in the supply`);
      }
      const item = rt.gm.itemManager.getItem(id, ed, true);
      rt.gm.stateManager.before('removeUnlockedItem', ed, id, item?.name ?? '');
      p.unlockedItems.splice(p.unlockedItems.indexOf(identifier), 1);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.setUnlockedItemCount',
    payload: z.object({ id: z.union([z.string(), z.number()]).transform(String), edition: z.string().default('fh'), count: z.number().int().min(-1) }),
    run(rt, { id, edition: ed, count: value }) {
      const identifier = party(rt).unlockedItems.find((i) => i.name === id && i.edition === ed);
      const item = rt.gm.itemManager.getItem(id, ed, true);
      if (!identifier || !item) {
        throw new CommandError(`Item ${id} is not in the supply`);
      }
      rt.gm.stateManager.before('updateUnlockedItemCount', ed, id, item.name);
      // GHS uses -1 for "all copies available".
      identifier.count = value >= item.count ? -1 : value;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.addTreasure',
    payload: z.object({ treasure: z.string().regex(/^\d+$/), edition: z.string().default('fh') }),
    run(rt, { treasure, edition: ed }) {
      const p = party(rt);
      if (p.treasures.some((t) => t.name === treasure && t.edition === ed)) {
        throw new CommandError(`Treasure ${treasure} is already looted`);
      }
      const editionData = rt.gm.editionData.find((e) => e.edition === ed);
      const index = +treasure - (editionData?.treasureOffset || 0) - 1;
      if (!editionData?.treasures || index < 0 || index >= editionData.treasures.length) {
        throw new CommandError(`Unknown treasure ${treasure}`, 'invalid_payload');
      }
      rt.gm.stateManager.before('addTreasure', ed, treasure);
      p.treasures = p.treasures || [];
      p.treasures.push(new Identifier(treasure, ed));
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.removeTreasure',
    payload: z.object({ treasure: z.string(), edition: z.string().default('fh') }),
    run(rt, { treasure, edition: ed }) {
      const p = party(rt);
      const found = p.treasures.find((t) => t.name === treasure && t.edition === ed);
      if (!found) {
        throw new CommandError(`Treasure ${treasure} is not looted`);
      }
      rt.gm.stateManager.before('removeTreasure', ed, treasure);
      p.treasures.splice(p.treasures.indexOf(found), 1);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.unlockScenario',
    payload: z.object({ index: z.string(), edition: z.string().default('fh'), group: z.string().optional() }),
    run(rt, { index, edition: ed, group }) {
      const data = rt.gm.scenarioManager.scenarioData(ed, true).find((s) => s.index === index && s.group === group);
      if (!data) {
        throw new CommandError(`Unknown scenario ${index}`, 'invalid_payload');
      }
      const p = party(rt);
      if (p.manualScenarios.some((m) => m.index === index && m.edition === ed && m.group === group)) {
        throw new CommandError(`Scenario ${index} is already unlocked`);
      }
      rt.gm.stateManager.before('addManualScenario', ...rt.gm.scenarioManager.scenarioUndoArgs(new Scenario(data)));
      p.manualScenarios.push(new GameScenarioModel(index, ed, group));
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.removeManualScenario',
    payload: z.object({ index: z.string(), edition: z.string().default('fh'), group: z.string().optional() }),
    run(rt, { index, edition: ed, group }) {
      const p = party(rt);
      const value = p.manualScenarios.find((m) => m.index === index && m.edition === ed && m.group === group);
      const data = rt.gm.scenarioManager.scenarioData(ed, true).find((s) => s.index === index && s.group === group);
      if (!value || !data) {
        throw new CommandError(`Scenario ${index} was not unlocked manually`);
      }
      rt.gm.stateManager.before('removeManualScenario', ...rt.gm.scenarioManager.scenarioUndoArgs(new Scenario(data)));
      p.manualScenarios.splice(p.manualScenarios.indexOf(value), 1);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.markScenarioCompleted',
    payload: z.object({
      index: z.string(),
      edition: z.string().default('fh'),
      group: z.string().optional(),
      conclusion: z.string().optional()
    }),
    run(rt, { index, edition: ed, group, conclusion }) {
      // GHS addSuccess: bookkeeping for scenarios finished outside a tracked session.
      const data = rt.gm.scenarioManager.scenarioData(ed, true).find((s) => s.index === index && s.group === group);
      if (!data) {
        throw new CommandError(`Unknown scenario ${index}`, 'invalid_payload');
      }
      const conclusions = rt.gm
        .sectionData(ed)
        .filter(
          (s) => s.edition === ed && s.parent === index && s.group === group && s.conclusion && rt.gm.scenarioManager.getRequirements(s).length === 0
        );
      const conclusionSection = conclusion ? conclusions.find((c) => c.index === conclusion) : undefined;
      if (conclusions.length > 0 && !conclusionSection) {
        throw new CommandError(`Choose a conclusion for scenario ${index}: ${conclusions.map((c) => c.index).join(', ')}`, 'invalid_payload');
      }
      const p = party(rt);
      const finishedBefore = p.scenarios.filter((m) => m.index === index && m.edition === ed && m.group === group).length;
      rt.gm.stateManager.before('finishScenario.success', ...rt.gm.scenarioManager.scenarioUndoArgs(new Scenario(data)));
      rt.gm.scenarioManager.finishScenario(
        new Scenario(data),
        true,
        conclusionSection,
        false,
        false,
        false,
        p.campaignMode && finishedBefore === 0,
        true
      );
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.removeCompletedScenario',
    payload: z.object({ index: z.string(), edition: z.string().default('fh'), group: z.string().optional(), casual: z.boolean().default(false) }),
    run(rt, { index, edition: ed, group, casual }) {
      const p = party(rt);
      const list = casual ? p.casualScenarios : p.scenarios;
      const value = list.find((m) => m.index === index && m.edition === ed && m.group === group);
      const data = rt.gm.scenarioManager.scenarioData(ed, true).find((s) => s.index === index && s.group === group);
      if (!value || !data) {
        throw new CommandError(`Scenario ${index} is not completed`);
      }
      rt.gm.stateManager.before('finishScenario.remove' + (casual ? 'Casual' : ''), ...rt.gm.scenarioManager.scenarioUndoArgs(new Scenario(data)));
      list.splice(list.indexOf(value), 1);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'conclusion.finish',
    payload: z.object({
      section: z.string(),
      /** Follow-up conclusion chosen, when the section offers several. */
      choice: z.string().optional(),
      chooseLocation: z.string().optional(),
      chooseUnlockCharacter: z.string().optional(),
      /** Week offsets for rewards.calendarSectionManual, in order (-1 = skip). */
      calendarSectionManual: z.array(z.number().int().min(-1).max(80)).optional()
    }),
    run(rt, payload) {
      const p = party(rt);
      const pending = rt.ext.pendingConclusions?.find((c) => c.section === payload.section);
      let sectionIndex = payload.section;
      if (hasConclusions(rt, payload.section)) {
        const choices = conclusionChoices(rt, payload.section);
        if (!payload.choice || !choices.some((c) => c.index === payload.choice)) {
          throw new CommandError(`Choose one of: ${choices.map((c) => c.index).join(', ')}`, 'invalid_payload');
        }
        sectionIndex = payload.choice;
      }
      const conclusion = rt.gm.sectionData(edition(rt)).find((s) => s.index === sectionIndex);
      if (!conclusion) {
        throw new CommandError(`Unknown section ${sectionIndex}`, 'invalid_payload');
      }
      const scenario = new Scenario(conclusion);
      rt.gm.stateManager.before('finishConclusion', ...rt.gm.scenarioManager.scenarioUndoArgs(scenario));
      // Same path as GHS' summary dialog for a conclusion.
      const summary = ScenarioSummary.open({ scenario, success: true, conclusion, conclusionOnly: true });
      const rewards = summary.rewards;
      if (payload.chooseLocation && rewards?.chooseLocation?.includes(payload.chooseLocation)) {
        summary.chooseLocation = payload.chooseLocation;
      }
      if (payload.chooseUnlockCharacter && rewards?.chooseUnlockCharacter?.includes(payload.chooseUnlockCharacter)) {
        summary.chooseUnlockCharacter = payload.chooseUnlockCharacter;
      }
      payload.calendarSectionManual?.forEach((value, i) => (summary.calendarSectionManual[i] = value));
      summary.finish();
      if (pending?.week !== undefined && !scenario.repeatable) {
        p.weekSections[pending.week] = [...(p.weekSections[pending.week] || []), scenario.index];
      }
      rt.gm.stateManager.after();
      rt.ext.pendingConclusions = (rt.ext.pendingConclusions ?? []).filter((c) => c.section !== payload.section);
    }
  }),
  defineCommand({
    type: 'conclusion.queue',
    payload: z.object({ section: z.string(), reason: text(200).default('added manually') }),
    run(rt, { section, reason }) {
      if (!rt.gm.sectionData(edition(rt)).some((s) => s.index === section)) {
        throw new CommandError(`Unknown section ${section}`, 'invalid_payload');
      }
      queueConclusion(rt, section, reason);
    }
  }),
  defineCommand({
    type: 'conclusion.dismiss',
    payload: z.object({ section: z.string() }),
    run(rt, { section }) {
      const pending = rt.ext.pendingConclusions?.find((c) => c.section === section);
      rt.ext.pendingConclusions = (rt.ext.pendingConclusions ?? []).filter((c) => c.section !== section);
      rt.log(pending?.kind === 'read' ? `Read section ${section}` : `Dismissed pending section ${section}`);
    }
  }),
  defineCommand({
    type: 'conclusion.remove',
    payload: z.object({ section: z.string(), edition: z.string().default('fh') }),
    run(rt, { section, edition: ed }) {
      if (!isConclusion(rt, section, ed)) {
        throw new CommandError(`Section ${section} is not a finished conclusion`);
      }
      rt.gm.stateManager.before('removeConclusion', party(rt).name, section);
      party(rt).conclusions = party(rt).conclusions.filter((c) => c.edition !== ed || c.index !== section);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.reactivateCharacter',
    payload: z.object({ edition: z.string(), name: z.string() }),
    run(rt, { edition: ed, name }) {
      const p = party(rt);
      const model = p.retirements.find((c) => c.name === name && c.edition === ed);
      if (!model) {
        throw new CommandError(`${ed}:${name} is not retired`);
      }
      if (rt.game.figures.some((f) => f instanceof Character && f.name === name && f.edition === ed)) {
        throw new CommandError(`${ed}:${name} is already in play`);
      }
      rt.gm.stateManager.before('unsetRetired', 'data.character.' + ed + '.' + name);
      const character = new Character(rt.gm.getCharacterData(name, ed), model.level);
      character.fromModel(model);
      character.progress.retired = false;
      character.progress.personalQuestProgress = [];
      rt.game.figures.push(character);
      p.retirements.splice(p.retirements.indexOf(model), 1);
      rt.gm.stateManager.after();
    }
  })
];

export const partyCommands = commands;
