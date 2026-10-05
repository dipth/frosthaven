import type { GameManager } from '@fh/ghs-core';

type ClassData = ReturnType<GameManager['charactersData']>[number];

/**
 * Official crossover classes: the Gloomhaven, Forgotten Circles and Jaws of
 * the Lion classes covered by Cephalofair's crossover character sheets. GHS'
 * fh-crossover edition also carries community Crimson Scales sheets and empty
 * Trail of Ashes templates, which we exclude.
 */
export function isOfficialCrossover(c: ClassData): boolean {
  return c.edition === 'fh-crossover' && /^(gh|fc|jotl)-/.test(c.icon ?? '') && !c.perkWarning;
}

/** Classes that may be played in this Frosthaven campaign. */
export function playableClasses(gm: GameManager): ClassData[] {
  return gm.charactersData().filter((c) => c.edition === 'fh' || isOfficialCrossover(c));
}

/**
 * Locked Frosthaven classes are spoilers until unlocked in the campaign.
 * Crossover classes are unlocked in their own games, so they are always shown.
 */
export function isClassUnlocked(unlockedCharacters: string[], c: ClassData): boolean {
  return c.edition !== 'fh' || !c.spoiler || unlockedCharacters.includes(`${c.edition}:${c.name}`);
}
