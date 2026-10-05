import type { GameManager } from '@fh/ghs-core';
import { isCrossoverCharacter } from './crossover';

type ClassData = ReturnType<GameManager['charactersData']>[number];

/** GHS editions holding the base classes of the official crossover sheets. */
export const CROSSOVER_BASE_EDITIONS = ['gh', 'gh-envx', 'fc', 'jotl'];

/**
 * Classes that may be played in this Frosthaven campaign: the Frosthaven
 * classes plus the Gloomhaven, Forgotten Circles and Jaws of the Lion classes
 * covered by Cephalofair's official crossover sheets. Crossover classes use
 * their base edition (e.g. `gh:brute`), as Secretariat stores them.
 */
export function playableClasses(gm: GameManager): ClassData[] {
  const fh = gm.charactersData('fh').filter((c) => c.edition === 'fh');
  const crossover = CROSSOVER_BASE_EDITIONS.flatMap((edition) => gm.charactersData(edition).filter((c) => c.edition === edition)).filter(
    (c) => isCrossoverCharacter(c)
  );
  return [...fh, ...crossover];
}

/**
 * Locked Frosthaven classes are spoilers until unlocked in the campaign.
 * Crossover classes are unlocked in their own games, so they are always shown.
 */
export function isClassUnlocked(unlockedCharacters: string[], c: ClassData): boolean {
  return c.edition !== 'fh' || !c.spoiler || unlockedCharacters.includes(`${c.edition}:${c.name}`);
}
