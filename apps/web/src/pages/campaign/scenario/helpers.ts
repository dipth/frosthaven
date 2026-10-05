import type { EntityRef, FigureRef } from '@fh/engine';
import { Character, gameManager, labelText, Monster } from '@fh/ghs-core';
import type { AttackModifier } from '@fh/ghs-core/vendor/game/model/data/AttackModifier';
import type { Loot } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { EntityValueFunction, type Entity } from '@fh/ghs-core/vendor/game/model/Entity';
import type { Figure } from '@fh/ghs-core/vendor/game/model/Figure';
import { MonsterEntity } from '@fh/ghs-core/vendor/game/model/MonsterEntity';
import { ObjectiveContainer } from '@fh/ghs-core/vendor/game/model/ObjectiveContainer';
import { ObjectiveEntity } from '@fh/ghs-core/vendor/game/model/ObjectiveEntity';
import { Summon } from '@fh/ghs-core/vendor/game/model/Summon';

export function figureRef(figure: Figure): FigureRef {
  if (figure instanceof Character) return { kind: 'character', edition: figure.edition, name: figure.name };
  if (figure instanceof Monster) return { kind: 'monster', edition: figure.edition, name: figure.name };
  return { kind: 'objective', uuid: (figure as ObjectiveContainer).uuid };
}

export function entityRef(figure: Figure, entity: Entity): EntityRef {
  if (entity instanceof Character) return { kind: 'character', edition: entity.edition, name: entity.name };
  if (entity instanceof Summon) return { kind: 'summon', edition: figure.edition, name: figure.name, uuid: entity.uuid };
  if (entity instanceof MonsterEntity) return { kind: 'monster', edition: figure.edition, name: figure.name, number: entity.number, type: entity.type };
  return { kind: 'objective', uuid: (figure as ObjectiveContainer).uuid, number: (entity as ObjectiveEntity).number };
}

export function maxHealth(entity: Entity): number {
  return EntityValueFunction(entity.maxHealth);
}

const amNames: Record<string, string> = {
  plus0: '+0',
  plus1: '+1',
  plus2: '+2',
  plus3: '+3',
  plus4: '+4',
  plusX: '+X',
  minus1: '-1',
  minus2: '-2',
  minus1extra: '-1',
  null: 'Miss',
  double: '2x',
  bless: '2x Bless',
  curse: 'Miss Curse',
  empower: '+2 Empower',
  enfeeble: '-2 Enfeeble',
  success: 'Success',
  wreck: 'Wreck'
};

function amValue(am: AttackModifier): string {
  switch (am.valueType) {
    case 'plus':
      return `+${am.value}`;
    case 'minus':
      return `-${am.value}`;
    case 'multiply':
      return `${am.value}x`;
    default:
      return am.type;
  }
}

/** Short text for an attack modifier card, e.g. "+1 poison (rolling)". */
export function amText(am: AttackModifier | undefined): string {
  if (!am) return '';
  const base = amNames[am.type] ?? amValue(am);
  const effects = (am.effects ?? [])
    .map((e) => {
      if (e.type === 'condition' || e.type === 'element') return labelText(`game.${e.type}.${e.value}`) || String(e.value);
      if (e.type === 'custom') return '';
      return `${e.type} ${e.value ?? ''}`.trim();
    })
    .filter(Boolean)
    .join(', ');
  return [base, effects].filter(Boolean).join(' ') + (am.rolling ? ' ↻' : '');
}

export function amTone(am: AttackModifier | undefined): string {
  if (!am) return 'text-frost-400';
  if (['null', 'curse', 'minus2', 'minus1', 'minus1extra', 'enfeeble'].includes(am.type)) return 'text-blood-400';
  if (['double', 'bless', 'plus2', 'plus3', 'plus4', 'empower'].includes(am.type)) return 'text-moss-400';
  return 'text-frost-100';
}

export function lootText(loot: Loot | undefined): string {
  if (!loot) return '';
  const value = gameManager.lootManager.getValue(loot);
  const name = labelText('game.loot.' + loot.type);
  return loot.type === 'random_item' ? name : `${value} ${name}`;
}

export function displayName(figure: Figure): string {
  if (figure instanceof Character) return gameManager.characterManager.characterName(figure);
  if (figure instanceof Monster) return labelText('data.monster.' + figure.name);
  const objective = figure as ObjectiveContainer;
  return objective.title || labelText(objective.escort ? 'escort' : 'objective');
}

/** Conditions selectable for an entity type in this edition. */
export function conditionChoices(): string[] {
  return gameManager.conditions(gameManager.game.edition).map((c) => c.name);
}

/** Finds the live figure/entity for a reference (after the store reloaded GHS). */
export function resolveRef(ref: EntityRef): { figure: Figure; entity: Entity } | undefined {
  const figures = gameManager.game.figures;
  if (ref.kind === 'character' || ref.kind === 'summon') {
    const figure = figures.find((f): f is Character => f instanceof Character && f.edition === ref.edition && f.name === ref.name);
    if (!figure) return undefined;
    if (ref.kind === 'character') return { figure, entity: figure };
    const summon = figure.summons.find((s) => s.uuid === ref.uuid && !s.dead);
    return summon ? { figure, entity: summon } : undefined;
  }
  if (ref.kind === 'monster') {
    const figure = figures.find((f): f is Monster => f instanceof Monster && f.edition === ref.edition && f.name === ref.name);
    const entity = figure?.entities.find((e) => e.number === ref.number && !e.dead);
    return figure && entity ? { figure, entity } : undefined;
  }
  const figure = figures.find((f): f is ObjectiveContainer => f instanceof ObjectiveContainer && f.uuid === ref.uuid);
  const entity = figure?.entities.find((e) => e.number === ref.number && !e.dead);
  return figure && entity ? { figure, entity } : undefined;
}
