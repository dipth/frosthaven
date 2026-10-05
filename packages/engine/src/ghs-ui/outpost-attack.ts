/**
 * Headless port of the calculations in GHS
 * src/app/ui/figures/entities-menu/outpost-attack/outpost-attack.ts
 * (AGPL-3.0): town guard deck, morale defense, barracks bonus, target order.
 */
import { gameManager } from '@fh/ghs-core';
import type { BuildingData } from '@fh/ghs-core/vendor/game/model/data/BuildingData';
import type { EventCardAttackTarget } from '@fh/ghs-core/vendor/game/model/data/EventCard';
import type { WorldMapCoordinates } from '@fh/ghs-core/vendor/game/model/data/WorldMap';
import type { BuildingModel } from '@fh/ghs-core/vendor/game/model/Building';
import type { AttackModifierDeck } from '@fh/ghs-core/vendor/game/model/data/AttackModifier';
import type { OutpostAttackState } from '../state';

export interface OutpostBuilding {
  model: BuildingModel;
  data: BuildingData;
}

/** The party's town guard deck, built from perks and the stored deck order (GHS update()). */
export function townGuardDeck(): AttackModifierDeck | undefined {
  const campaign = gameManager.campaignManager.campaignData();
  if (!campaign?.townGuardPerks) return undefined;
  const deck = gameManager.attackModifierManager.buildTownGuardAttackModifierDeck(gameManager.game.party, campaign);
  if (gameManager.game.party.townGuardDeck) {
    gameManager.attackModifierManager.fromModel(deck, gameManager.game.party.townGuardDeck);
  } else {
    gameManager.attackModifierManager.shuffleModifiers(deck);
  }
  return deck;
}

export function moraleDefense(morale: number): number {
  if (morale < 3) return -10;
  if (morale < 5) return -5;
  if (morale < 8) return 0;
  if (morale < 11) return 5;
  if (morale < 14) return 10;
  return 15;
}

/** Buildings that can be attacked: built, with a numeric id (GHS allBuildings). */
export function outpostBuildings(): OutpostBuilding[] {
  const campaign = gameManager.campaignManager.campaignData();
  const buildings: OutpostBuilding[] = [];
  gameManager.game.party.buildings.forEach((model) => {
    const data = campaign?.buildings?.find((b) => b.name === model.name);
    if (data && model.level && data.id && !isNaN(+data.id)) {
      buildings.push({ model, data });
    }
  });
  return buildings;
}

export function barracks() {
  const model = gameManager.game.party.buildings.find((b) => b.name === 'barracks' && b.level);
  if (!model) return undefined;
  const bonus = model.state === 'wrecked' ? 0 : ([0, -5, -15, -25, -35][model.level] ?? -35);
  return { level: model.level, wrecked: model.state === 'wrecked', bonus };
}

/** Advantage with defending soldiers, disadvantage when the barracks are wrecked. */
export function drawFactor(soldiers: number): 'advantage' | 'disadvantage' | undefined {
  const b = barracks();
  if (!b) return undefined;
  if (b.wrecked) return 'disadvantage';
  return soldiers ? 'advantage' : undefined;
}

/** Attack value against the current target, after soldiers (GHS applyBaracks). */
export function currentAttackValue(state: OutpostAttackState): number {
  const b = barracks();
  return state.attackValue + (b && !b.wrecked ? state.soldiers * b.bonus : 0);
}

export function defenseValue(): number {
  return (gameManager.game.party.defense || 0) + moraleDefense(gameManager.game.party.morale);
}

export function eligibleBuilding(building: OutpostBuilding, target: EventCardAttackTarget | undefined): boolean {
  if (building.model.state === 'wrecked') return false;
  const number = +building.data.id;
  if (target?.parity && ((target.parity === 'even' && number % 2 === 1) || (target.parity === 'odd' && number % 2 === 0))) return false;
  if (target?.lowerBoundary && number < target.lowerBoundary) return false;
  if (target?.upperBoundary && number > target.upperBoundary) return false;
  return true;
}

function distance(building: OutpostBuilding, to: string | WorldMapCoordinates | undefined, all: OutpostBuilding[]): number {
  let value: number | undefined;
  if (typeof to === 'string') {
    const other = all.find((b) => b.model.name === to);
    if (other) value = gameManager.buildingsManager.distanceBetween(building.model, other.model);
  } else if (to) {
    value = gameManager.buildingsManager.distanceFrom(building.model, to);
  }
  return value ?? -1;
}

/** Eligible buildings in attack order (GHS applyFilter + sortBuildings). */
export function initialTargetOrder(target: EventCardAttackTarget | undefined): string[] {
  const all = outpostBuildings();
  const eligible = all.filter((b) => eligibleBuilding(b, target));
  const to = target?.distance === 'previousTarget' ? undefined : target?.distance;
  eligible.sort((a, b) => {
    if (target?.level && a.model.level !== b.model.level) {
      return target.level === 'low' ? a.model.level - b.model.level : b.model.level - a.model.level;
    }
    if (to) {
      const da = distance(a, to, all);
      const db = distance(b, to, all);
      if (da !== -1 && db !== -1 && da !== db) return da - db;
    }
    return +a.data.id - +b.data.id;
  });
  if (target?.desc) eligible.reverse();
  return eligible.map((b) => b.model.name);
}

/** After a hit with distance "previous target", the remaining targets are sorted by distance to it. */
export function sortByPreviousTarget(order: string[], attacked: number): string[] {
  const all = outpostBuildings();
  const previous = all.find((b) => b.model.name === order[attacked - 1]);
  if (!previous) return order;
  const done = order.slice(0, attacked);
  const rest = order.slice(attacked).sort((a, b) => {
    const ba = all.find((x) => x.model.name === a);
    const bb = all.find((x) => x.model.name === b);
    const da = ba ? (gameManager.buildingsManager.distanceBetween(ba.model, previous.model) ?? -1) : -1;
    const db = bb ? (gameManager.buildingsManager.distanceBetween(bb.model, previous.model) ?? -1) : -1;
    return da > 0 && db > 0 ? da - db : 0;
  });
  return [...done, ...rest];
}
