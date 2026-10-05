/**
 * Plain-text port of GHS src/app/ui/figures/event/effect/event-card-effect.ts,
 * condition/event-card-condition.ts and their templates (AGPL-3.0).
 */
import { gameManager, labelText, plainText, settingsManager } from '@fh/ghs-core';
import { CharacterClass } from '@fh/ghs-core/vendor/game/model/data/CharacterData';
import {
  EventCardConditionType,
  EventCardEffectType,
  type EventCard,
  type EventCardAttack,
  type EventCardCondition,
  type EventCardEffect
} from '@fh/ghs-core/vendor/game/model/data/EventCard';

/** GHS labels often have per-edition variants (`{"": "...", "fh": "..."}`). */
function editionKey(key: string, edition: string) {
  return settingsManager.labelExists(`${key}.${edition}`) ? `${key}.${edition}` : key;
}

function joinList(items: string[], connector: string) {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${connector} ${items[items.length - 1]}`;
}

/** Drops a trailing period, like GHS' `[slice]="[0, -1]"` for concatenated effects. */
function inline(text: string) {
  return text.replace(/\.$/, '');
}

export function conditionText(condition: string | EventCardCondition, edition: string): string {
  if (typeof condition === 'string') {
    return plainText(labelText(condition));
  }
  const values = condition.values ?? [];
  const nested = values.filter((v): v is string | EventCardCondition => typeof v !== 'number');
  switch (condition.type) {
    case EventCardConditionType.and:
      return nested.map((c) => conditionText(c, edition)).join(` ${labelText('game.events.conditions.and')} `);
    case EventCardConditionType.payCollectiveGoldConditional:
      return [
        labelText('game.events.conditions.payCollectiveGoldConditional.prefix'),
        nested.map((c) => conditionText(c, edition).toLowerCase()).join(` ${labelText('game.events.conditions.payCollectiveGoldConditional.connector')} `),
        labelText('game.events.conditions.payCollectiveGoldConditional.suffix')
      ].join(' ');
  }
  let args: string[] = values.filter((v): v is string | number => typeof v !== 'object').map(String);
  const strings = values.filter((v): v is string => typeof v === 'string');
  switch (condition.type) {
    case EventCardConditionType.character:
      args = [joinList(strings.map((c) => labelText(`data.character.${edition}.${c}`)), 'or')];
      break;
    case EventCardConditionType.building:
      args = [joinList(strings.map((b) => labelText(`data.buildings.${b}`)), 'and')];
      break;
    case EventCardConditionType.traits:
    case EventCardConditionType.traitsAll:
      args = [
        joinList(
          strings.map((t) => (t in CharacterClass ? labelText('character.class.' + t) : labelText('data.character.traits.' + t))),
          condition.type === EventCardConditionType.traits ? 'or' : 'and'
        )
      ];
      break;
    case EventCardConditionType.startingGroup:
      args = [joinList(strings.map((g) => `"${labelText('data.character.startingGroup.' + g)}"`), 'or')];
      break;
  }
  return labelText(editionKey('game.events.conditions.' + condition.type, edition), [...args, edition]);
}

export function effectText(effect: string | EventCardEffect, edition: string): string {
  if (typeof effect === 'string') {
    return plainText(labelText(effect));
  }
  const values = effect.values ?? [];
  const nested = values.filter((v): v is string | EventCardEffect => typeof v !== 'number');
  const prefix = effect.condition ? `${conditionText(effect.condition, edition)}: ` : '';
  switch (effect.type) {
    case EventCardEffectType.choose:
      return (
        prefix +
        [
          labelText('game.events.effects.choose.prefix'),
          nested.map((e) => inline(effectText(e, edition))).join(` ${labelText('game.events.effects.choose.connector')} `)
        ].join(' ') +
        labelText('game.events.effects.choose.suffix')
      );
    case EventCardEffectType.additionally:
      return prefix + `${labelText('game.events.effects.additionally')} ${nested.map((e) => effectText(e, edition)).join(' ')}`;
    case EventCardEffectType.and:
      return prefix + nested.map((e) => inline(effectText(e, edition))).join(` ${labelText('game.events.effects.and')} `) + '.';
    case EventCardEffectType.checkbox:
      return prefix + nested.map((e) => `☐ ${effectText(e, edition)}`).join(' ');
  }
  let args: string[] = values.filter((v): v is string | number => typeof v !== 'object').map(String);
  if (effect.type === EventCardEffectType.scenarioCondition || effect.type === EventCardEffectType.traitScenarioCondition) {
    const conditionValues = (effect.type === EventCardEffectType.traitScenarioCondition ? values.slice(1) : values).filter(
      (v): v is string => typeof v === 'string'
    );
    const conditions = conditionValues.map((value) => {
      const [name, count] = value.split(':');
      return labelText('game.condition.' + name) + (count ? ` x${count}` : '');
    });
    args = [joinList(conditions, labelText('and'))];
    if (effect.type === EventCardEffectType.traitScenarioCondition && typeof values[0] === 'string') {
      args.unshift(values[0]);
    }
  }
  const key = editionKey('game.events.effects.' + effect.type + (effect.alt ? '.' + effect.alt : ''), edition);
  return prefix + labelText(key, [...args, edition]);
}

/** Effects that `eventCardManager.applyEffects` applies automatically. */
export function effectAutomated(effect: string | EventCardEffect): boolean {
  if (typeof effect === 'string') return false;
  if ([EventCardEffectType.and, EventCardEffectType.additionally, EventCardEffectType.checkbox].includes(effect.type)) {
    return effect.values.some((e) => typeof e === 'object' && gameManager.eventCardManager.applicableEffect(e));
  }
  return gameManager.eventCardManager.applicableEffect(effect);
}

export function attackText(attack: EventCardAttack): string {
  return `Attack ${attack.attackValue}, ${attack.targetNumber} target${attack.targetNumber === 1 ? '' : 's'}${
    attack.targetDescription ? `: ${labelText(attack.targetDescription)}` : ''
  }`;
}

export function eventLabel(key: string | undefined): string {
  return key ? labelText(key) : '';
}

export function eventCardTitle(card: Pick<EventCard, 'type' | 'cardId'>): string {
  return `${labelText('game.events.type.' + card.type)} ${card.cardId}`;
}

/** Resolvable outcomes per option (GHS EventCardComponent.resolvable). */
export function resolvableOutcomes(card: EventCard): boolean[][] {
  return card.options.map(
    (option) => option.outcomes?.map((outcome) => !outcome.condition || gameManager.eventCardManager.resolvableCondition(outcome.condition)) ?? []
  );
}

/** Index of the option holding the outpost attack (no label), or -1. */
export function attackOptionIndex(card: EventCard): number {
  return card.options.findIndex((option) => option.outcomes?.some((outcome) => !!outcome.attack));
}
