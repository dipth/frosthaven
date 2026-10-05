import { labelText, plainText } from '@fh/ghs-core';

export function characterName(c: { edition: string; name: string; title?: string }) {
  return labelText(`data.character.${c.edition}.${c.name}`);
}

export function monsterName(m: { name: string }) {
  return labelText(`data.monster.${m.name}`);
}

export function buildingName(name: string) {
  return labelText(`data.buildings.${name}`);
}

export function achievementName(kind: 'party' | 'global', key: string) {
  return labelText(`data.${kind === 'party' ? 'partyAchievements' : 'globalAchievements'}.${key}`);
}

export function stickerName(key: string) {
  return labelText(`data.campaignSticker.${key}`);
}

export function lootName(type: string) {
  return labelText(`game.loot.${type}`);
}

export function eventDeckName(type: string) {
  return labelText(`game.events.type.${type}`);
}

/** GHS Frosthaven event card ids are already the printed ids, e.g. "SR-01". */
export function eventCardName(_type: string, cardId: string) {
  return cardId;
}

/** Frosthaven seasons alternate every 10 weeks, starting with summer. */
export function season(weeks: number): 'summer' | 'winter' {
  return Math.max(weeks, 0) % 20 < 10 ? 'summer' : 'winter';
}

/** GHS strings are either label keys or text with %label% placeholders. */
export function ghsText(value: string) {
  return value.includes('%') || value.includes(' ') ? plainText(value) : labelText(value);
}
