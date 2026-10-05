// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { gameManager } from '../businesslogic/GameManager';
import { Action } from './data/Action';
import { ConditionName, EntityCondition } from './data/Condition';
import { AdditionalIdentifier } from './data/Identifier';
import { GameState } from './Game';
import { evaluateExpression, UnknownVariableError } from '../util/ExpressionEvaluator';

export interface Entity {
  active: boolean;
  off: boolean;
  health: number;
  level: number;
  maxHealth: number | string;
  entityConditions: EntityCondition[];
  immunities: ConditionName[];
  number: number;
  markers: string[];
  tags: string[];
  shield: Action | undefined;
  shieldPersistent: Action | undefined;
  retaliate: Action[];
  retaliatePersistent: Action[];
  extraActions: Action[];
  extraActionsPersistent: Action[];
}

export type EntityCounter = { identifier: AdditionalIdentifier; total: number; killed: number };

export const EntityExpressionRegex = /^([xCL0-9\.\+\/\-\*\(\)\=\?\:\|\s\>\<]+)$/;
export const EntityValueRegex = /\[([a-zA-Z0-9\.\+\/\-\*\(\)\=\?\:\|\s\>\<\,]+)\]/;

export function EntityValueFunction(value: string | number, L: number | undefined = undefined): number {
  if (!value) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (value === '-') {
    return 0;
  }

  let expression = value;
  let wasBracketed = false;

  const match = value.match(EntityValueRegex);

  if (match && match[0].length === value.length) {
    expression = match[1];
    wasBracketed = true;
  }

  if (L === undefined) {
    L = gameManager.game.level;
  }

  let result = 0;
  try {
    result = evaluateExpression(expression, {
      C: gameManager.levelManager.characterCountVariable(),
      L: L,
      P: gameManager.campaignManager.prosperityLevel(),
      R: gameManager.game.round + (gameManager.game.state === GameState.draw ? 1 : 0)
    });
  } catch (e) {
    if (wasBracketed && e instanceof UnknownVariableError) {
      throw e;
    }
    console.warn('Could not evaluate expression: ' + expression, e);
    return 0;
  }

  return Math.round(result);
}
