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

const eventImageFolders: Record<string, [string, string]> = {
  'summer-road': ['road', 'sre'],
  'winter-road': ['road', 'wre'],
  'summer-outpost': ['outpost', 'soe'],
  'winter-outpost': ['outpost', 'woe'],
  boat: ['boat', 'be']
};

/** Worldhaven image of a Frosthaven event card (synced into ASSETS_DIR; may be missing). */
export function eventCardImage(type: string, cardId: string, side: 'f' | 'b' = 'f'): string | undefined {
  const folder = eventImageFolders[type];
  const number = /(\d+)$/.exec(cardId)?.[1];
  if (!folder || !number) return undefined;
  return `/assets/worldhaven/events/frosthaven/${folder[0]}/fh-${folder[1]}-${number.padStart(2, '0')}-${side}.png`;
}
