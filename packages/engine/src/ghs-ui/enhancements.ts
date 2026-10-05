/**
 * Enhancement cost calculator, after GHS
 * src/app/ui/figures/character/sheet/abilities/enhancements/enhancements.ts
 * and EnhancementsManager.calculateCosts (AGPL-3.0). GHS reads the enhanced
 * action from structured card data, which only some classes have; here the
 * player describes the enhancement (what's enhanced, multi-target, lost or
 * persistent) as on the physical cost table, so it works for every class.
 */
import { gameManager, type Character } from '@fh/ghs-core';
import { Action, ActionType } from '@fh/ghs-core/vendor/game/model/data/Action';
import { ConditionName } from '@fh/ghs-core/vendor/game/model/data/Condition';
import { Element } from '@fh/ghs-core/vendor/game/model/data/Element';
import type { EnhancementAction } from '@fh/ghs-core/vendor/game/model/data/Enhancement';

export interface EnhancementSpec {
  cardId: number;
  half: 'top' | 'bottom';
  /** 'plus1' on an action, a condition, an element, 'jump', or 'hex' (area). */
  enhancement: EnhancementAction;
  /** For +1: the ability being enhanced (move, attack, range, ...). */
  base?: ActionType;
  /** The ability targets multiple figures (doubles the cost). */
  multiTarget?: boolean;
  /** For 'hex': number of target hexes in the area before enhancing. */
  hexes?: number;
  special?: 'summon' | 'lost' | 'persistent';
}

export function abilityCard(character: Character, cardId: number) {
  return gameManager.deckData(character).abilities.find((a) => a.cardId === cardId);
}

/** Existing enhancements on that half of the card (each adds to the cost). */
export function previousEnhancements(character: Character, cardId: number, half: 'top' | 'bottom'): number {
  return (character.progress.enhancements ?? []).filter((e) => e.cardId === cardId && e.actionIndex.startsWith('bottom') === (half === 'bottom')).length;
}

function enhanceAction(spec: EnhancementSpec): Action {
  const e = spec.enhancement;
  if (e === 'plus1') return new Action(spec.base ?? ActionType.attack, 1);
  if (e === 'hex') return new Action(ActionType.area, '');
  if (e === ActionType.jump) return new Action(ActionType.jump);
  if ((Object.values(Element) as string[]).includes(e)) return new Action(ActionType.element, e);
  if ((Object.values(ConditionName) as string[]).includes(e)) return new Action(ActionType.condition, e);
  return new Action(ActionType.attack, 1);
}

/** Gold cost, mirroring EnhancementsManager.calculateCosts. */
export function enhancementCost(character: Character, spec: EnhancementSpec): number {
  const em = gameManager.enhancementsManager;
  const card = abilityCard(character, spec.cardId);
  const level = typeof card?.level === 'number' ? card.level : 1;
  const action = enhanceAction(spec);
  let costs =
    spec.enhancement === 'hex' ? Math.ceil(200 / Math.max(1, spec.hexes ?? 1)) : em.calculateBaseCosts(action, spec.special);
  if (costs <= 0) return 0;
  const multiTargetApplies = spec.enhancement !== 'hex' && !(em.fh && [ActionType.target, ActionType.element].includes(action.type));
  if (spec.multiTarget && multiTargetApplies) costs *= 2;
  if (em.fh && spec.special === 'lost') costs = Math.ceil(costs / 2);
  if (em.fh && !gameManager.gh2eRules() && spec.special === 'persistent') costs *= 3;
  costs += em.levelCosts(level);
  const previous = previousEnhancements(character, spec.cardId, spec.half);
  costs += em.enhancementCosts(previous);
  if (em.fh && em.temporary) {
    if (previous) costs -= 20;
    costs = Math.ceil(costs * 0.8);
  }
  if (em.enhancerLevel > 1) costs -= 10;
  return costs;
}

/** Ability card picks at level-up (GHS ability-cards-dialog). */
export function cardsToPick(character: Character): { count: number; maxLevel: number } {
  const count = Math.max(0, character.level - (character.progress.deck?.length ?? 0) - 1);
  return { count, maxLevel: count ? character.level - count + 1 : 0 };
}
