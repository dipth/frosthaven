/**
 * Alchemist recipes, after GHS src/app/ui/figures/items/brew/brew.ts
 * (AGPL-3.0) getItem(): two herbs (three with the alchemist at level 3);
 * a recipe with a repeated herb makes the special potion that needs no herbs.
 */
import { gameManager } from '@fh/ghs-core';
import type { ItemData } from '@fh/ghs-core/vendor/game/model/data/ItemData';
import { LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';

export const BREW_HERBS: LootType[] = [LootType.flamefruit, LootType.corpsecap, LootType.axenut, LootType.snowthistle, LootType.rockroot, LootType.arrowvine];

/** Number of herbs per brew: 0 without a working alchemist. */
export function brewingHerbs(): number {
  const game = gameManager.game;
  if (!gameManager.fhRules() || !game.party.campaignMode) return 2;
  const alchemist = game.party.buildings.find((b) => b.name === 'alchemist' && b.level);
  if (!alchemist || alchemist.state === 'wrecked') return 0;
  return alchemist.level < 3 ? 2 : 3;
}

export function brewResult(recipe: LootType[]): ItemData | undefined {
  if (recipe.length < 2) return undefined;
  const three = recipe.length >= 3;
  const items = gameManager.itemManager
    .getItems(gameManager.currentEdition(), true)
    .filter(
      (item) =>
        (!item.requiredItems || !item.requiredItems.length) &&
        item.requiredBuilding === 'alchemist' &&
        (three ? item.requiredBuildingLevel >= 3 : item.requiredBuildingLevel < 3)
    );
  if (new Set(recipe).size !== recipe.length) {
    return items.find((item) => !item.resources);
  }
  return items.find((item) => item.resources && BREW_HERBS.every((herb) => recipe.filter((h) => h === herb).length === (item.resources[herb] || 0)));
}

/** Herbs paid by the brewer first, then the outpost supply (GHS addHerb). */
export function suggestedHerbSpend(recipe: LootType[], brewer: { progress: { loot: Partial<Record<LootType, number>> } } | undefined) {
  const character: Partial<Record<LootType, number>> = {};
  const party: Partial<Record<LootType, number>> = {};
  for (const herb of recipe) {
    if ((brewer?.progress.loot[herb] || 0) > (character[herb] || 0)) {
      character[herb] = (character[herb] || 0) + 1;
    } else {
      party[herb] = (party[herb] || 0) + 1;
    }
  }
  return { character, party };
}
