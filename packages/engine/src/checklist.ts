/**
 * Physical sync checklist: what to change in the physical box so it matches
 * the app again, from the state when the box was last in sync (the baseline)
 * to now. Each item has a stable id, so ticks survive recomputation.
 */
import { gameManager, labelText, type GameModel } from '@fh/ghs-core';
import type { GameCharacterModel } from '@fh/ghs-core/vendor/game/model/Character';

export type ChecklistGroup = 'campaign' | 'calendar' | 'buildings' | 'events' | 'decks' | 'items' | 'characters' | 'unlocks';

export interface ChecklistItem {
  id: string;
  group: ChecklistGroup;
  text: string;
}

export const CHECKLIST_GROUPS: { key: ChecklistGroup; label: string }[] = [
  { key: 'campaign', label: 'Campaign sheet' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'buildings', label: 'Outpost buildings' },
  { key: 'events', label: 'Event decks' },
  { key: 'decks', label: 'Town guard deck' },
  { key: 'items', label: 'Item supply' },
  { key: 'characters', label: 'Character sheets' },
  { key: 'unlocks', label: 'Unlocks' }
];

type Party = GameModel['party'];

const label = (key: string, fallback: string) => {
  const text = labelText(key);
  return text && text !== key ? text : fallback;
};
const characterName = (c: { edition: string; name: string; title?: string }) =>
  c.title || label(`data.character.${c.edition}.${c.name}`, c.name);
const buildingName = (name: string) => label(`data.buildings.${name}`, name);
const lootName = (type: string) => label(`game.loot.${type}`, type).toLowerCase();
const deckName = (type: string) => label(`game.events.type.${type}`, type);
const itemName = (id: string | number, edition: string) => {
  const item = gameManager.itemManager.getItem(id, edition, true);
  return item ? `item ${item.id} ${item.name}` : `item ${id}`;
};
const scenarioName = (index: string, edition: string) => {
  const s = gameManager.scenarioData(edition).find((x) => x.index === index && !x.group);
  return s ? `${index} ${s.name}` : index;
};

function counts<T>(list: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of list) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
  return m;
}

function setDiff<T>(before: T[], after: T[], key: (t: T) => string) {
  const b = counts(before, key);
  const a = counts(after, key);
  const added: string[] = [];
  const removed: string[] = [];
  for (const [k, n] of a) for (let i = (b.get(k) ?? 0); i < n; i++) added.push(k);
  for (const [k, n] of b) for (let i = (a.get(k) ?? 0); i < n; i++) removed.push(k);
  return { added, removed };
}

function delta(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

export function physicalChecklist(baseline: GameModel, current: GameModel): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const add = (group: ChecklistGroup, id: string, text: string) => items.push({ id: `${group}:${id}`, group, text });
  const b: Party = baseline.party;
  const c: Party = current.party;
  const edition = c.edition ?? 'fh';

  // Campaign sheet values.
  const values: [keyof Party, string][] = [
    ['prosperity', 'prosperity checkmarks'],
    ['morale', 'morale'],
    ['defense', 'total defense'],
    ['soldiers', 'soldiers'],
    ['inspiration', 'inspiration'],
    ['townGuardPerks', 'town guard perk checkmarks'],
    ['reputation', 'reputation']
  ];
  for (const [key, name] of values) {
    const before = Number(b[key] ?? 0);
    const after = Number(c[key] ?? 0);
    if (before !== after) add('campaign', `${String(key)}:${after}`, `Set ${name} to ${after} (${delta(after - before)})`);
  }
  for (const type of new Set([...Object.keys(b.loot ?? {}), ...Object.keys(c.loot ?? {})])) {
    const before = (b.loot as Record<string, number>)[type] ?? 0;
    const after = (c.loot as Record<string, number>)[type] ?? 0;
    if (before !== after) add('campaign', `loot:${type}:${after}`, `Frosthaven supply: ${after} ${lootName(type)} (${delta(after - before)})`);
  }
  const achievements = setDiff(b.achievementsList ?? [], c.achievementsList ?? [], (x) => x);
  achievements.added.forEach((a) => add('campaign', `achievement+${a}`, `Gain party achievement “${label(`data.partyAchievements.${a}`, a)}”`));
  achievements.removed.forEach((a) => add('campaign', `achievement-${a}`, `Lose party achievement “${label(`data.partyAchievements.${a}`, a)}”`));
  const global = setDiff(b.globalAchievementsList ?? [], c.globalAchievementsList ?? [], (x) => x);
  global.added.forEach((a) => add('campaign', `global+${a}`, `Gain global achievement “${label(`data.globalAchievements.${a}`, a)}”`));
  global.removed.forEach((a) => add('campaign', `global-${a}`, `Lose global achievement “${label(`data.globalAchievements.${a}`, a)}”`));
  const stickers = setDiff(b.campaignStickers ?? [], c.campaignStickers ?? [], (x) => x);
  stickers.added.forEach((s) => add('campaign', `sticker+${s}`, `Place campaign sticker “${label(`data.campaignSticker.${s}`, s)}”`));
  stickers.removed.forEach((s) => add('campaign', `sticker-${s}`, `Remove campaign sticker “${label(`data.campaignSticker.${s}`, s)}”`));
  const perkSections = setDiff(b.townGuardPerkSections ?? [], c.townGuardPerkSections ?? [], (x) => x);
  perkSections.added.forEach((s) => add('campaign', `tgperk+${s}`, `Town guard perk unlocked by section ${s}: apply it to the town guard deck`));
  const treasures = setDiff(b.treasures ?? [], c.treasures ?? [], (t) => t.name);
  treasures.added.forEach((t) => add('campaign', `treasure+${t}`, `Mark treasure ${t} as looted`));
  const completed = setDiff(b.scenarios ?? [], c.scenarios ?? [], (s) => s.index);
  completed.added.forEach((s) => add('campaign', `scenario+${s}`, `Mark scenario ${scenarioName(s, edition)} as completed on the map`));
  const unlockedScenarios = setDiff(b.manualScenarios ?? [], c.manualScenarios ?? [], (s) => s.index);
  unlockedScenarios.added.forEach((s) => add('unlocks', `scenario+${s}`, `Place the sticker for scenario ${scenarioName(s, edition)}`));

  // Calendar.
  if ((c.weeks ?? 0) !== (b.weeks ?? 0)) {
    const from = (b.weeks ?? 0) + 1;
    const to = c.weeks ?? 0;
    add('calendar', `weeks:${to}`, to > (b.weeks ?? 0) ? `Mark week${to > from ? `s ${from}–${to}` : ` ${to}`} on the calendar` : `Calendar is back to week ${to}: erase later marks`);
  }
  for (const week of new Set([...Object.keys(b.weekSections ?? {}), ...Object.keys(c.weekSections ?? {})])) {
    const diff = setDiff((b.weekSections as Record<string, string[]>)[week] ?? [], (c.weekSections as Record<string, string[]>)[week] ?? [], (x) => x);
    diff.added.forEach((s) => add('calendar', `section+${week}:${s}`, `Write section ${s} in week ${week}`));
    diff.removed.forEach((s) => add('calendar', `section-${week}:${s}`, `Cross out section ${s} in week ${week}`));
  }

  // Buildings.
  const bb = new Map((b.buildings ?? []).map((x) => [x.name, x]));
  for (const building of c.buildings ?? []) {
    const before = bb.get(building.name);
    const name = buildingName(building.name);
    if (!before && building.level > 0) add('buildings', `${building.name}:${building.level}`, `Build ${name} (level ${building.level}) on the outpost map`);
    else if (!before) add('buildings', `${building.name}:available`, `${name} is now available to build`);
    else if (before.level !== building.level) add('buildings', `${building.name}:${building.level}`, `${name}: ${before.level ? `level ${before.level} → ` : 'build '}level ${building.level}`);
    if (before && before.state !== building.state) add('buildings', `${building.name}:state:${building.state}`, `${name} is now ${building.state}`);
  }

  // Event decks.
  const types = new Set([...Object.keys(b.eventDecks ?? {}), ...Object.keys(c.eventDecks ?? {})]);
  const drawnBefore = b.eventCards?.length ?? 0;
  const drawn = (c.eventCards ?? []).slice(drawnBefore);
  for (const type of types) {
    const before = (b.eventDecks as Record<string, string[]>)[type] ?? [];
    const after = (c.eventDecks as Record<string, string[]>)[type] ?? [];
    const diff = setDiff(before, after, (x) => x);
    diff.removed.forEach((id) => add('events', `${type}-${id}`, `Remove ${id} from the ${deckName(type)} deck`));
    diff.added.forEach((id) => add('events', `${type}+${id}`, `Shuffle ${id} into the ${deckName(type)} deck`));
    for (const card of drawn.filter((d) => d.type === type && before.includes(d.cardId) && after.includes(d.cardId))) {
      add('events', `${type}:bottom:${card.cardId}`, `Put ${card.cardId} at the bottom of the ${deckName(type)} deck`);
    }
  }

  // Town guard deck.
  if (b.townGuardDeck || c.townGuardDeck) {
    const diff = setDiff(b.townGuardDeck?.cards ?? [], c.townGuardDeck?.cards ?? [], (x) => x);
    diff.added.forEach((id) => add('decks', `tg+${id}`, `Add town guard card ${id}`));
    diff.removed.forEach((id) => add('decks', `tg-${id}`, `Remove town guard card ${id}`));
  }

  // Item supply.
  const unlocked = setDiff(b.unlockedItems ?? [], c.unlockedItems ?? [], (i) => `${i.edition}:${i.name}`);
  unlocked.added.forEach((k) => {
    const [ed, id] = k.split(':');
    add('items', `unlock+${k}`, `Add ${itemName(id!, ed!)} to the item supply`);
  });

  // Characters.
  const all = (m: GameModel) => [...(m.characters ?? []), ...(m.party.availableCharacters ?? [])] as GameCharacterModel[];
  const key = (x: { edition: string; name: string }) => `${x.edition}:${x.name}`;
  const beforeChars = new Map(all(baseline).map((x) => [key(x), x]));
  const retiredNow = setDiff(b.retirements ?? [], c.retirements ?? [], (x) => key(x));
  for (const r of retiredNow.added) {
    const model = (c.retirements ?? []).find((x) => key(x) === r)!;
    add('characters', `retired:${r}`, `${characterName(model)} retired: file away the character sheet, cards and personal quest`);
  }
  for (const character of all(current)) {
    const k = key(character);
    const before = beforeChars.get(k);
    const name = characterName(character);
    const p = character.progress;
    if (!p) continue;
    if (!before?.progress) {
      add('characters', `new:${k}`, `New character ${name}: level ${character.level}, ${p.gold} gold, ${p.experience} XP`);
      continue;
    }
    const q = before.progress;
    if (before.level !== character.level) add('characters', `${k}:level:${character.level}`, `${name}: level ${character.level}`);
    if (q.experience !== p.experience) add('characters', `${k}:xp:${p.experience}`, `${name}: XP ${p.experience} (${delta(p.experience - q.experience)})`);
    if (q.gold !== p.gold) add('characters', `${k}:gold:${p.gold}`, `${name}: gold ${p.gold} (${delta(p.gold - q.gold)})`);
    for (const type of new Set([...Object.keys(q.loot ?? {}), ...Object.keys(p.loot ?? {})])) {
      const x = (q.loot as Record<string, number>)[type] ?? 0;
      const y = (p.loot as Record<string, number>)[type] ?? 0;
      if (x !== y) add('characters', `${k}:loot:${type}:${y}`, `${name}: ${y} ${lootName(type)} (${delta(y - x)})`);
    }
    if ((q.battleGoals ?? 0) !== (p.battleGoals ?? 0)) add('characters', `${k}:checks:${p.battleGoals}`, `${name}: ${p.battleGoals} battle goal checkmarks (${delta(p.battleGoals - (q.battleGoals ?? 0))})`);
    const perks = (p.perks ?? []).map((n, i) => n - (q.perks?.[i] ?? 0));
    perks.forEach((d, i) => d && add('characters', `${k}:perk:${i}:${p.perks[i]}`, `${name}: ${d > 0 ? 'check' : 'uncheck'} perk ${i + 1}${Math.abs(d) > 1 ? ` ×${Math.abs(d)}` : ''}`));
    const masteries = setDiff(q.masteries ?? [], p.masteries ?? [], String);
    masteries.added.forEach((m) => add('characters', `${k}:mastery:${m}`, `${name}: check mastery ${Number(m) + 1}`));
    const items2 = setDiff(q.items ?? [], p.items ?? [], (i) => `${i.edition}:${i.name}`);
    items2.added.forEach((i) => {
      const [ed, id] = i.split(':');
      add('characters', `${k}:item+${i}`, `${name} takes ${itemName(id!, ed!)} from the supply`);
    });
    items2.removed.forEach((i) => {
      const [ed, id] = i.split(':');
      add('characters', `${k}:item-${i}`, `${name} returns ${itemName(id!, ed!)} to the supply`);
    });
    const enh = setDiff(q.enhancements ?? [], p.enhancements ?? [], (e) => `${e.cardId}:${e.actionIndex}:${e.index}:${e.action}`);
    enh.added.forEach((e) => {
      const [cardId, , , action] = e.split(':');
      add('characters', `${k}:enh+${e}`, `${name}: place a ${action === 'plus1' ? '+1' : action} enhancement sticker on card ${cardId}`);
    });
    const picks = setDiff(q.deck ?? [], p.deck ?? [], String);
    if (picks.added.length) add('characters', `${k}:deck:${(p.deck ?? []).join('.')}`, `${name}: add ${picks.added.length} new ability card${picks.added.length === 1 ? '' : 's'} to the deck`);
    if ((q.personalQuest ?? '') !== (p.personalQuest ?? '')) add('characters', `${k}:pq:${p.personalQuest}`, `${name}: personal quest ${p.personalQuest || '(none)'}`);
    const pqChanged = (p.personalQuestProgress ?? []).some((v, i) => v !== (q.personalQuestProgress?.[i] ?? 0));
    if (pqChanged) add('characters', `${k}:pqp:${(p.personalQuestProgress ?? []).join('.')}`, `${name}: personal quest progress ${(p.personalQuestProgress ?? []).join(' / ')}`);
  }

  // Unlocks.
  const classes = setDiff(baseline.unlockedCharacters ?? [], current.unlockedCharacters ?? [], (x) => x);
  classes.added.forEach((x) => {
    const [ed, name] = x.split(':');
    add('unlocks', `class+${x}`, `Unlock the ${label(`data.character.${ed}.${name}`, name!)} class (open its box)`);
  });

  return items;
}
