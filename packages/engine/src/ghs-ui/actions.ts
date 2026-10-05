/**
 * Plain-text rendering of GHS actions (monster ability cards, stat blocks),
 * with normal/elite values calculated like GHS
 * src/app/ui/figures/actions/action.ts getValue() (AGPL-3.0).
 */
import { gameManager, labelText, plainText } from '@fh/ghs-core';
import { ActionType, ActionValueType, type Action } from '@fh/ghs-core/vendor/game/model/data/Action';
import type { MonsterStat } from '@fh/ghs-core/vendor/game/model/data/MonsterStat';
import { MonsterType } from '@fh/ghs-core/vendor/game/model/data/MonsterType';
import { EntityExpressionRegex, EntityValueFunction, EntityValueRegex } from '@fh/ghs-core/vendor/game/model/Entity';
import type { Monster } from '@fh/ghs-core';

export interface ActionLine {
  /** Text with values; when normal and elite differ, `values` carries both. */
  text: string;
  values?: { normal: string; elite: string };
  depth: number;
}

const names: Partial<Record<ActionType, string>> = {
  attack: 'Attack',
  move: 'Move',
  range: 'Range',
  target: 'Target',
  heal: 'Heal',
  shield: 'Shield',
  retaliate: 'Retaliate',
  pierce: 'Pierce',
  push: 'Push',
  pull: 'Pull',
  jump: 'Jump',
  fly: 'Flying',
  teleport: 'Teleport',
  loot: 'Loot',
  damage: 'Damage',
  sufferDamage: 'Suffer damage',
  swing: 'Swing',
  extra: 'Extra'
};

function isCalculable(value: unknown) {
  return typeof value === 'number' || (typeof value === 'string' && (EntityExpressionRegex.test(value) || EntityValueRegex.test(value)));
}

/** GHS getValue() for one monster type. */
function value(action: Action, stat: MonsterStat | undefined, level: number): string {
  if (stat && (action.valueType === ActionValueType.plus || action.valueType === ActionValueType.minus)) {
    let statValue = 0;
    let sign = true;
    switch (action.type) {
      case ActionType.attack:
        if (typeof stat.attack === 'number') {
          statValue = stat.attack;
        } else if (stat.attack.includes('X')) {
          return `${stat.attack} ${action.valueType === ActionValueType.plus ? '+' : '-'}${action.value}`;
        } else {
          try {
            statValue = EntityValueFunction(stat.attack, level);
          } catch {
            sign = false;
          }
        }
        stat.actions?.forEach((statAction) => {
          if (statAction.type === ActionType.attack) {
            if (statAction.valueType === ActionValueType.add) statValue += EntityValueFunction(statAction.value, level);
            else if (statAction.valueType === ActionValueType.subtract) statValue = Math.max(0, statValue - EntityValueFunction(statAction.value, level));
          }
        });
        break;
      case ActionType.move:
        statValue = EntityValueFunction(stat.movement, level);
        break;
      case ActionType.range:
        statValue = EntityValueFunction(stat.range, level);
        break;
      default:
        sign = false;
    }
    if (sign && (action.value || action.value === 0) && isCalculable(action.value)) {
      if (action.valueType === ActionValueType.plus) return String(statValue + EntityValueFunction(action.value));
      if (!statValue) return '-';
      return String(statValue - EntityValueFunction(action.value));
    }
  }
  const raw = isCalculable(action.value) ? EntityValueFunction(action.value, level) : action.value;
  if (action.valueType === ActionValueType.plus) return `+${raw}`;
  if (action.valueType === ActionValueType.minus) return `-${raw}`;
  return String(raw ?? '');
}

function describe(action: Action, normal: string, elite: string): Omit<ActionLine, 'depth'> | undefined {
  const v = normal === elite ? normal : `${normal} / ${elite}`;
  const values = normal === elite ? undefined : { normal, elite };
  switch (action.type) {
    case ActionType.condition:
      return { text: labelText('game.condition.' + action.value) + (action.valueType === ActionValueType.fixed && Number(action.value) ? '' : '') };
    case ActionType.element:
    case ActionType.elementHalf: {
      const elements = String(action.value).split(':').map((e) => labelText('game.element.' + e)).join(' or ');
      return { text: action.valueType === ActionValueType.minus ? `Consume ${elements}` : `Infuse ${elements}` };
    }
    case ActionType.specialTarget:
      return { text: plainText(labelText('game.specialTarget.' + action.value)) };
    case ActionType.custom:
      return { text: plainText(String(action.value)) };
    case ActionType.area:
      return { text: 'Area effect' };
    case ActionType.summon:
      return { text: `Summon ${String(action.value).split(':').map((m) => labelText('data.monster.' + m)).join(', ')}` };
    case ActionType.spawn:
      return { text: `Spawn ${String(action.value).split(':').map((m) => labelText('data.monster.' + m)).join(', ')}` };
    case ActionType.special:
      return { text: `Special ${action.value}` };
    case ActionType.monsterType:
      return { text: labelText('game.monster.' + action.value) || String(action.value) };
    case ActionType.card:
      return { text: action.value === 'reshuffle' ? 'Shuffle' : String(action.value) };
    case ActionType.grant:
      return { text: 'Grant:' };
    case ActionType.trigger:
      return { text: 'Trigger:' };
    case ActionType.round:
      return { text: `${action.value} round:` };
    case ActionType.hint:
    case ActionType.nonCalc:
    case ActionType.concatenation:
    case ActionType.concatenationSpacer:
    case ActionType.box:
    case ActionType.boxFhSubActions:
    case ActionType.forceBox:
    case ActionType.grid:
    case ActionType.fontSize:
      return undefined;
    default: {
      const name = names[action.type] ?? action.type;
      return { text: v === '' ? name : `${name} ${v}`, values };
    }
  }
}

function walk(actions: Action[], monster: Monster | undefined, lines: ActionLine[], depth: number) {
  const level = monster?.level ?? gameManager.game.level;
  const normalStat = monster ? gameManager.monsterManager.getStat(monster, monster.boss ? MonsterType.boss : MonsterType.normal) : undefined;
  const eliteStat = monster && !monster.boss ? gameManager.monsterManager.getStat(monster, MonsterType.elite) : undefined;
  for (const action of actions ?? []) {
    if (action.hidden) continue;
    if (action.type === ActionType.special && monster) {
      const special = normalStat?.special?.[Number(action.value) - 1];
      if (special) {
        walk(special, monster, lines, depth);
        continue;
      }
    }
    if (action.type === ActionType.concatenation || action.type === ActionType.box || action.type === ActionType.boxFhSubActions || action.type === ActionType.forceBox || action.type === ActionType.grid) {
      walk(action.subActions, monster, lines, depth);
      continue;
    }
    const normal = value(action, normalStat, level);
    const elite = eliteStat ? value(action, eliteStat, level) : normal;
    const line = describe(action, normal, elite);
    if (line) lines.push({ ...line, depth });
    if (action.subActions?.length) walk(action.subActions, monster, lines, line ? depth + 1 : depth);
  }
}

/** Lines for a monster ability card (or any action list), values computed for the monster's stats. */
export function actionLines(actions: Action[], monster?: Monster): ActionLine[] {
  const lines: ActionLine[] = [];
  walk(actions, monster, lines, 0);
  return lines;
}

/** Text for a monster stat block's innate actions (shield, retaliate, ...) and immunities. */
export function statLines(monster: Monster, type: MonsterType): string[] {
  const stat = gameManager.monsterManager.getStat(monster, type);
  const lines = actionLines(stat.actions ?? [], undefined).map((l) => l.text);
  if (stat.immunities?.length) {
    lines.push('Immune: ' + stat.immunities.map((c) => labelText('game.condition.' + c)).join(', '));
  }
  return lines;
}
