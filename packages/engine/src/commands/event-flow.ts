/**
 * Drawing and resolving event cards, ported from GHS
 * src/app/ui/figures/event/draw/event-card-draw.ts, event-card.ts (option and
 * outcome selection) and entities-menu/helpers/event.ts (result handling)
 * (AGPL-3.0). The card being resolved lives in ext.eventDraft so every client
 * sees the same card and choices; what the app can't apply automatically ends
 * up in ext.eventFollowUps.
 */
import { AdditionalIdentifier } from '@fh/ghs-core/vendor/game/model/data/Identifier';
import { ItemFlags } from '@fh/ghs-core/vendor/game/model/data/ItemData';
import {
  EventCardConditionType,
  EventCardEffectType,
  type EventCard,
  type EventCardAttack,
  type EventCardCondition,
  type EventCardEffect
} from '@fh/ghs-core/vendor/game/model/data/EventCard';
import { LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { Character } from '@fh/ghs-core';
import { z } from 'zod';
import { attackOptionIndex, resolvableOutcomes } from '../ghs-ui/event-text';
import { CommandError, defineCommand, type CommandDef, type Runtime } from '../runtime';
import { characterKey, type EventDraft, type EventFollowUp } from '../state';

/** GHS CollectiveDistributionEffects (event-distribution-dialog.ts). */
export const DISTRIBUTION_EFFECTS: string[] = [
  EventCardEffectType.collectiveGold,
  EventCardEffectType.collectiveGoldAdditional,
  EventCardEffectType.collectiveGoldOther,
  EventCardEffectType.collectiveItem,
  EventCardEffectType.collectiveResource,
  EventCardEffectType.collectiveResourceType,
  EventCardEffectType.consumeItem,
  EventCardEffectType.consumeCollectiveItem,
  EventCardEffectType.item,
  EventCardEffectType.itemCollective,
  EventCardEffectType.loseItem,
  EventCardEffectType.loseCollectiveExperience,
  EventCardEffectType.loseCollectiveGold,
  EventCardEffectType.loseCollectiveResource,
  EventCardEffectType.loseCollectiveResourceAny,
  EventCardEffectType.loseCollectiveResourceType
];

function edition(rt: Pick<Runtime, 'gm' | 'game'>) {
  return rt.game.edition ?? rt.gm.currentEdition();
}

export function draftCard(rt: Pick<Runtime, 'gm'>, draft: Pick<EventDraft, 'edition' | 'type' | 'cardId'>): EventCard | undefined {
  return rt.gm.eventCardManager.getEventCardForEdition(draft.edition, draft.type, draft.cardId);
}

function draft(rt: Runtime) {
  const current = rt.ext.eventDraft;
  if (!current) {
    throw new CommandError('No event card is being resolved');
  }
  const card = draftCard(rt, current);
  if (!card) {
    throw new CommandError(`Unknown event ${current.type} ${current.cardId}`);
  }
  return { draft: current, card };
}

function newDraft(rt: Runtime, type: string, cardId: string): EventDraft {
  const card = rt.gm.eventCardManager.getEventCardForEdition(edition(rt), type, cardId);
  if (!card) {
    throw new CommandError(`Unknown ${type} event ${cardId}`);
  }
  const previous = rt.game.party.eventCards.find((id) => id.cardId === card.cardId && id.type === card.type && id.edition === card.edition);
  return {
    edition: card.edition,
    type: card.type,
    cardId: card.cardId,
    selected: -1,
    subSelections: [],
    checks: previous?.checks ? [...previous.checks] : [],
    attack: attackOptionIndex(card) !== -1
  };
}

/** GHS EventCardComponent.selectOption: preselects the outcomes that apply. */
function selectOption(card: EventCard, current: EventDraft, index: number) {
  const attackIndex = attackOptionIndex(card);
  if (attackIndex !== -1 && attackIndex === index) {
    return;
  }
  const resolvable = resolvableOutcomes(card);
  current.attack = attackIndex !== -1;
  current.selected = Math.max(index, -1);
  current.subSelections = [];
  const option = card.options[index];
  if (index > -1 && option) {
    option.outcomes.forEach((outcome, i) => {
      if (!resolvable[index]?.[i]) return;
      const condition = outcome.condition;
      if (typeof condition !== 'string' && condition?.type === EventCardConditionType.otherwise) {
        if (!resolvable[index]!.some((value, vi) => value && vi < i && !!option.outcomes[vi]!.condition)) {
          current.subSelections.push(i);
        }
      } else {
        current.subSelections.push(i);
      }
      if (
        current.subSelections.includes(i) &&
        outcome.effects?.some((effect) => typeof effect === 'object' && effect.type === EventCardEffectType.skipThreat)
      ) {
        current.attack = false;
      }
    });
  }
}

/** GHS EventCardComponent.selectSub. */
function toggleOutcome(card: EventCard, current: EventDraft, optionIndex: number, index: number, force: boolean) {
  if (current.selected !== optionIndex) {
    if (force) selectOption(card, current, optionIndex);
    return;
  }
  const outcomes = card.options[current.selected]!.outcomes;
  if (current.subSelections.includes(index)) {
    current.subSelections.splice(current.subSelections.indexOf(index), 1);
  } else if (resolvableOutcomes(card)[current.selected]?.[index] || force) {
    current.subSelections.push(index);
    if (!force) {
      const condition = outcomes[index]?.condition;
      if (condition && typeof condition !== 'string' && condition.type === EventCardConditionType.otherwise) {
        current.subSelections = [index];
      } else {
        const otherwise = outcomes.findIndex(
          (outcome) => outcome.condition && typeof outcome.condition !== 'string' && outcome.condition.type === EventCardConditionType.otherwise
        );
        if (otherwise !== -1) {
          current.subSelections = current.subSelections.filter((i) => i !== otherwise);
        }
      }
    }
  }
}

/** Every condition object on the card, to tell conditions from effects in applyEvent's results. */
function cardConditions(card: EventCard): Set<unknown> {
  const conditions = new Set<unknown>();
  const visitCondition = (condition: unknown) => {
    if (condition && typeof condition === 'object') {
      conditions.add(condition);
      (condition as EventCardCondition).values?.forEach(visitCondition);
    }
  };
  const visitEffect = (effect: unknown) => {
    if (effect && typeof effect === 'object') {
      visitCondition((effect as EventCardEffect).condition);
      (effect as EventCardEffect).values?.forEach(visitEffect);
    }
  };
  card.options.forEach((option) =>
    option.outcomes?.forEach((outcome) => {
      visitCondition(outcome.condition);
      outcome.effects?.forEach(visitEffect);
      outcome.attack?.effects?.forEach(visitEffect);
    })
  );
  return conditions;
}

/** GHS EventHelper.createEventResults: sorts results into what the group handles next. */
function followUp(card: EventCard, results: (EventCardEffect | EventCardCondition | EventCardAttack)[]): EventFollowUp | undefined {
  const conditions = cardConditions(card);
  const result: EventFollowUp = { edition: card.edition, type: card.type, cardId: card.cardId, manual: [], distribution: [] };
  const attackEffects: EventCardEffect[] = [];
  let attack: EventCardAttack | undefined;
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  for (const value of results) {
    if (!('type' in value)) {
      attack = clone(value);
    } else if (conditions.has(value)) {
      result.manual.push({ kind: 'condition', value: clone(value as EventCardCondition) });
    } else {
      const effect = value as EventCardEffect;
      if (effect.type === EventCardEffectType.outpostAttack || effect.type === EventCardEffectType.outpostTarget) {
        attackEffects.push(clone(effect));
      } else if (DISTRIBUTION_EFFECTS.includes(effect.type)) {
        result.distribution.push(clone(effect));
      } else {
        result.manual.push({ kind: 'effect', value: clone(effect) });
      }
    }
  }
  if (attack || attackEffects.length) {
    result.outpostAttack = { ...(attack ? { attack } : {}), effects: attackEffects };
  }
  return result.manual.length || result.distribution.length || result.outpostAttack ? result : undefined;
}

const amount = z.number().int().min(0).max(999);
const valueType = z.union([z.literal('gold'), z.literal('experience'), z.enum(Object.values(LootType) as [LootType, ...LootType[]])]);
const itemRef = z.object({ character: z.string(), id: z.union([z.string(), z.number()]), edition: z.string() });

function characterByKey(rt: Runtime, key: string): Character {
  const character = rt.game.figures.find((f): f is Character => f instanceof Character && characterKey(f) === key);
  if (!character) {
    throw new CommandError(`Unknown character ${key}`, 'invalid_payload');
  }
  return character;
}

function followUpAt(rt: Runtime, index: number) {
  const value = rt.ext.eventFollowUps?.[index];
  if (!value) {
    throw new CommandError('No such event follow-up');
  }
  return value;
}

function dropEmptyFollowUps(rt: Runtime) {
  rt.ext.eventFollowUps = rt.ext.eventFollowUps?.filter((f) => f.manual.length || f.distribution.length || f.outpostAttack);
  if (!rt.ext.eventFollowUps?.length) delete rt.ext.eventFollowUps;
}

const commands: CommandDef[] = [
  defineCommand({
    type: 'eventDraw.start',
    payload: z.object({ type: z.string().optional(), cardId: z.string().optional() }),
    run(rt, { type: requested, cardId }) {
      if (rt.ext.eventDraft) {
        throw new CommandError('Finish resolving the current event first');
      }
      const type = requested ?? rt.game.eventDraw;
      if (!type) {
        throw new CommandError('Which event deck?', 'invalid_payload');
      }
      const deck = rt.game.party.eventDecks[type];
      const id = cardId ?? deck?.[0];
      if (!id) {
        throw new CommandError(`The ${type} deck is empty`);
      }
      rt.ext.eventDraft = newDraft(rt, type, id);
      if (rt.ext.outpostPhase && type.endsWith('outpost')) rt.ext.outpostPhase.event = { type, cardId: id };
      rt.log(`Drew ${type} event ${id}`);
    }
  }),
  defineCommand({
    type: 'eventDraw.select',
    payload: z.object({ option: z.number().int().min(-1) }),
    run(rt, { option }) {
      const { draft: current, card } = draft(rt);
      if (option >= card.options.length) {
        throw new CommandError('No such option', 'invalid_payload');
      }
      selectOption(card, current, option);
    }
  }),
  defineCommand({
    type: 'eventDraw.toggleOutcome',
    payload: z.object({ option: z.number().int().min(0), outcome: z.number().int().min(0), force: z.boolean().default(false) }),
    run(rt, { option, outcome, force }) {
      const { draft: current, card } = draft(rt);
      if (!card.options[option]?.outcomes?.[outcome]) {
        throw new CommandError('No such outcome', 'invalid_payload');
      }
      toggleOutcome(card, current, option, outcome, force);
    }
  }),
  defineCommand({
    type: 'eventDraw.check',
    payload: z.object({ index: z.number().int().min(0).max(20), checks: z.number().int().min(0).max(20) }),
    run(rt, { index, checks }) {
      const { draft: current } = draft(rt);
      current.checks[index] = checks;
      current.checks = Array.from(current.checks, (value) => value ?? 0);
    }
  }),
  defineCommand({
    type: 'eventDraw.toggleAttack',
    payload: z.object({ attack: z.boolean() }),
    run(rt, { attack }) {
      draft(rt).draft.attack = attack;
    }
  }),
  defineCommand({
    type: 'eventDraw.redraw',
    payload: z.object({}),
    run(rt) {
      const { card } = draft(rt);
      rt.gm.stateManager.before('eventDraw.new', card.edition, card.type, card.cardId);
      rt.gm.eventCardManager.removeEvent(card.type, card.cardId);
      const next = rt.game.party.eventDecks[card.type]?.[0];
      rt.gm.eventCardManager.addEvent(card.type, card.cardId);
      rt.gm.stateManager.after();
      if (next) {
        rt.ext.eventDraft = newDraft(rt, card.type, next);
      }
    }
  }),
  defineCommand({
    type: 'eventDraw.cancel',
    payload: z.object({}),
    run(rt) {
      const current = rt.ext.eventDraft;
      if (current) {
        rt.gm.stateManager.before('eventDraw.cancel', current.edition, current.type, current.cardId);
      }
      delete rt.ext.eventDraft;
      rt.game.eventDraw = undefined;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'eventDraw.accept',
    payload: z.object({ apply: z.boolean().default(true) }),
    run(rt, { apply }) {
      const { draft: current, card } = draft(rt);
      if (apply && current.selected === -1) {
        throw new CommandError('Choose an option first');
      }
      rt.gm.stateManager.before('eventDraw.accept', card.edition, card.type, card.cardId);
      rt.game.eventDraw = undefined;
      delete rt.ext.eventDraft;
      const inScenario = rt.game.scenario !== undefined && rt.gm.roundManager.firstRound;
      const results = rt.gm.eventCardManager.applyEvent(
        card,
        current.selected,
        current.subSelections,
        current.checks,
        inScenario,
        current.attack,
        apply
      );
      rt.gm.stateManager.after();
      const option = card.options[current.selected];
      rt.log(`Resolved ${card.type} event ${card.cardId}${option?.label ? `, option ${option.label}` : ''}`);
      const next = followUp(card, results);
      if (next) {
        (rt.ext.eventFollowUps ??= []).push(next);
      }
    }
  }),
  defineCommand({
    type: 'eventFollowUp.distribute',
    payload: z.object({
      index: z.number().int().min(0),
      gains: z.array(z.object({ character: z.string(), type: valueType, amount })).default([]),
      losses: z.array(z.object({ character: z.string().optional(), type: valueType, amount })).default([]),
      addItems: z.array(itemRef).default([]),
      removeItems: z.array(itemRef).default([]),
      consumeItems: z.array(itemRef).default([])
    }),
    run(rt, { index, gains, losses, addItems, removeItems, consumeItems }) {
      const current = followUpAt(rt, index);
      rt.gm.stateManager.before('eventDistribution');
      for (const { character: key, type, amount: value } of gains) {
        const character = characterByKey(rt, key);
        if (type === 'gold') character.progress.gold += value;
        else if (type === 'experience') character.progress.experience += value;
        else character.progress.loot[type] = (character.progress.loot[type] ?? 0) + value;
      }
      for (const { character: key, type, amount: value } of losses) {
        if (!key) {
          if (type === 'gold' || type === 'experience') {
            throw new CommandError('The outpost has no gold or experience', 'invalid_payload');
          }
          rt.game.party.loot[type] = Math.max(0, (rt.game.party.loot[type] ?? 0) - value);
          continue;
        }
        const character = characterByKey(rt, key);
        if (type === 'gold') character.progress.gold = Math.max(0, character.progress.gold - value);
        else if (type === 'experience') character.progress.experience = Math.max(0, character.progress.experience - value);
        else character.progress.loot[type] = Math.max(0, (character.progress.loot[type] ?? 0) - value);
      }
      const item = (ref: z.infer<typeof itemRef>) => {
        const data = rt.gm.itemManager.getItem(ref.id, ref.edition, true);
        if (!data) throw new CommandError(`Unknown item ${ref.id}`, 'invalid_payload');
        return { data, character: characterByKey(rt, ref.character) };
      };
      for (const ref of addItems) {
        const { data, character } = item(ref);
        rt.gm.itemManager.addItem(data, character);
      }
      for (const ref of removeItems) {
        const { data, character } = item(ref);
        rt.gm.itemManager.removeItem(data, character);
      }
      for (const ref of consumeItems) {
        const { data, character } = item(ref);
        let equipped = character.progress.equippedItems.find((id) => id.name === '' + data.id && id.edition === data.edition);
        if (!equipped) {
          equipped = new AdditionalIdentifier(data.id, data.edition);
          character.progress.equippedItems.push(equipped);
        }
        equipped.tags = equipped.tags ?? [];
        if (!equipped.tags.includes(ItemFlags.consumed)) equipped.tags.push(ItemFlags.consumed);
      }
      rt.gm.stateManager.after();
      current.distribution = [];
      dropEmptyFollowUps(rt);
    }
  }),
  defineCommand({
    type: 'eventFollowUp.dismiss',
    payload: z.object({ index: z.number().int().min(0), part: z.enum(['manual', 'distribution', 'outpostAttack', 'all']) }),
    run(rt, { index, part }) {
      const current = followUpAt(rt, index);
      if (part === 'manual' || part === 'all') current.manual = [];
      if (part === 'distribution' || part === 'all') current.distribution = [];
      if (part === 'outpostAttack' || part === 'all') delete current.outpostAttack;
      dropEmptyFollowUps(rt);
    }
  })
];

export const eventFlowCommands = commands;
