/**
 * Building costs and payment, after GHS
 * src/app/ui/figures/party/buildings/list/buildings-list.ts (upgradeable) and
 * upgrade-dialog/upgrade-dialog.ts (AGPL-3.0). Shared by the server
 * (validation) and the client (payment dialog).
 */
import { Character, gameManager } from '@fh/ghs-core';
import type { BuildingData } from '@fh/ghs-core/vendor/game/model/data/BuildingData';
import { LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import type { BuildingModel } from '@fh/ghs-core/vendor/game/model/Building';
import { characterKey } from '../state';

export const MATERIALS = [LootType.lumber, LootType.metal, LootType.hide] as const;
export type Material = (typeof MATERIALS)[number];

export type BuildingAction = 'build' | 'upgrade' | 'repair' | 'rebuild' | 'soldier';

export interface Costs {
  gold: number;
  lumber: number;
  metal: number;
  hide: number;
  /** Materials of any kind (repairs, soldiers). */
  any: number;
  prosperity: number;
}

export interface CharacterPayment {
  character: string;
  gold: number;
  lumber: number;
  metal: number;
  hide: number;
}

export interface Payment {
  /** From the outpost supply; inspiration replaces missing materials. */
  party: { lumber: number; metal: number; hide: number; inspiration: number };
  characters: CharacterPayment[];
}

const zero: Costs = { gold: 0, lumber: 0, metal: 0, hide: 0, any: 0, prosperity: 0 };

export function partyCharacters(): Character[] {
  return gameManager.game.figures.filter((f): f is Character => f instanceof Character);
}

/** A working carpenter makes one material free (not for repairs). */
export function carpenterDiscount(): boolean {
  return gameManager.game.party.buildings.some((b) => b.name === 'carpenter' && b.level > 0 && b.state !== 'wrecked');
}

/** What the next construction step for a building is, and what it costs. */
export function buildingStep(
  model: BuildingModel,
  data: BuildingData
): { action: BuildingAction; costs: Costs; /** Upgrade unlocked by the campaign, not bought. */ manual?: boolean } | undefined {
  if (model.level > 0 && model.state === 'damaged' && data.repair) {
    return { action: 'repair', costs: { ...zero, any: data.repair[model.level - 1] ?? 0 } };
  }
  if (model.level > 0 && model.state === 'wrecked' && data.rebuild) {
    const c = data.rebuild[model.level - 1];
    return c ? { action: 'rebuild', costs: { ...zero, ...pick(c) } } : undefined;
  }
  if (model.level < (data.upgrades?.length ?? 0) + 1) {
    const c = model.level ? data.upgrades[model.level - 1] : data.costs;
    return c ? { action: model.level ? 'upgrade' : 'build', costs: { ...zero, ...pick(c) }, ...(c.manual ? { manual: true } : {}) } : undefined;
  }
  return undefined;
}

export const SOLDIER_COSTS: Costs = { ...zero, gold: 3, any: 1 };

function pick(c: { gold?: number; lumber?: number; metal?: number; hide?: number; prosperity?: number }) {
  return { gold: c.gold || 0, lumber: c.lumber || 0, metal: c.metal || 0, hide: c.hide || 0, prosperity: c.prosperity || 0 };
}

/** GHS soldierAvailable: working barracks with room for another soldier. */
export function soldierCapacity(): number {
  const barracks = gameManager.game.party.buildings.find((b) => b.name === 'barracks' && b.level > 0 && b.state === 'normal');
  return barracks ? 2 + barracks.level * 2 : 0;
}

/** The upgrade dialog's starting point: materials from the outpost supply first, discount on the first missing one. */
export function suggestedPayment(costs: Costs, discount: boolean): Payment {
  const supply = gameManager.game.party.loot;
  const party = { lumber: 0, metal: 0, hide: 0, inspiration: 0 };
  let discountFree = discount;
  for (const type of MATERIALS) {
    let value = Math.max(0, costs[type] - (discountFree ? 1 : 0));
    discountFree = false;
    if (value > (supply[type] || 0)) {
      value = supply[type] || 0;
      discountFree = discount;
    }
    party[type] = value;
  }
  let any = costs.any;
  for (const type of MATERIALS) {
    const value = Math.min(any, (supply[type] || 0) - party[type]);
    party[type] += value;
    any -= value;
  }
  return {
    party,
    characters: partyCharacters().map((c) => ({ character: characterKey(c), gold: 0, lumber: 0, metal: 0, hide: 0 }))
  };
}

export function paid(payment: Payment) {
  const total = { gold: 0, lumber: payment.party.lumber, metal: payment.party.metal, hide: payment.party.hide };
  for (const c of payment.characters) {
    total.gold += c.gold;
    total.lumber += c.lumber;
    total.metal += c.metal;
    total.hide += c.hide;
  }
  return total;
}

/** Why a payment doesn't cover the costs (empty when it does). */
export function paymentProblems(costs: Costs, discount: boolean, payment: Payment): string[] {
  const problems: string[] = [];
  const total = paid(payment);
  if (costs.prosperity && costs.prosperity > gameManager.campaignManager.prosperityLevel()) {
    problems.push(`Needs prosperity ${costs.prosperity}`);
  }
  if (total.gold !== costs.gold) {
    problems.push(`Pay exactly ${costs.gold} gold (${total.gold} so far)`);
  }
  const shortfall = MATERIALS.reduce((sum, type) => sum + Math.max(0, costs[type] - total[type]), 0);
  const surplus = MATERIALS.reduce((sum, type) => sum + Math.max(0, total[type] - costs[type]), 0);
  const missing = shortfall + Math.max(0, costs.any - surplus) - payment.party.inspiration - (discount ? 1 : 0);
  if (missing > 0) {
    problems.push(`${missing} material${missing === 1 ? '' : 's'} missing`);
  }
  const supply = gameManager.game.party.loot;
  for (const type of MATERIALS) {
    if (payment.party[type] > (supply[type] || 0)) problems.push(`The outpost only has ${supply[type] || 0} ${type}`);
  }
  if (payment.party.inspiration > gameManager.game.party.inspiration) {
    problems.push(`The outpost only has ${gameManager.game.party.inspiration} inspiration`);
  }
  for (const entry of payment.characters) {
    const character = partyCharacters().find((c) => characterKey(c) === entry.character);
    if (!character) {
      problems.push(`Unknown character ${entry.character}`);
      continue;
    }
    if (entry.gold > character.progress.gold) problems.push(`${character.name} only has ${character.progress.gold} gold`);
    for (const type of MATERIALS) {
      if (entry[type] > (character.progress.loot[type] || 0)) problems.push(`${character.name} only has ${character.progress.loot[type] || 0} ${type}`);
    }
  }
  return problems;
}

/** GHS lootManager.applySelectResources for a validated payment. */
export function applyPayment(payment: Payment) {
  const party = gameManager.game.party;
  for (const type of MATERIALS) {
    party.loot[type] = (party.loot[type] || 0) - payment.party[type];
  }
  party.inspiration -= payment.party.inspiration;
  for (const entry of payment.characters) {
    const character = partyCharacters().find((c) => characterKey(c) === entry.character)!;
    character.progress.gold -= entry.gold;
    for (const type of MATERIALS) {
      character.progress.loot[type] = (character.progress.loot[type] || 0) - entry[type];
    }
  }
}
