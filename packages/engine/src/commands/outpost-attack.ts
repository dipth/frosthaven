/**
 * Outpost attacks, ported from GHS
 * src/app/ui/figures/entities-menu/outpost-attack/outpost-attack.ts
 * (AGPL-3.0). The attack in progress lives in ext.outpostAttack so all
 * clients follow the same town guard draws.
 */
import { EventCardEffectType, type EventCardAttack } from '@fh/ghs-core/vendor/game/model/data/EventCard';
import { EntityValueFunction } from '@fh/ghs-core/vendor/game/model/Entity';
import { z } from 'zod';
import {
  currentAttackValue,
  defenseValue,
  drawFactor,
  initialTargetOrder,
  outpostBuildings,
  sortByPreviousTarget,
  townGuardDeck
} from '../ghs-ui/outpost-attack';
import { CommandError, defineCommand, type CommandDef, type Runtime } from '../runtime';
import type { OutpostAttackState } from '../state';

function attackState(rt: Runtime): OutpostAttackState {
  if (!rt.ext.outpostAttack) {
    throw new CommandError('No outpost attack is running');
  }
  return rt.ext.outpostAttack;
}

function deck(rt: Runtime) {
  const value = townGuardDeck();
  if (!value) {
    throw new CommandError('This campaign has no town guard deck');
  }
  rt.game.party.townGuardDeck ??= value.toModel();
  return value;
}

function computeResult(rt: Runtime, state: OutpostAttackState, forceIndex = -1) {
  const tg = deck(rt);
  const result = rt.gm.attackModifierManager.calculateAttackResult(tg, defenseValue(), forceIndex);
  if (!result) {
    delete state.result;
    return;
  }
  state.result = {
    index: result.index,
    chooseOffset: result.chooseOffset,
    value: result.result,
    stringified: result.stringified,
    type: tg.cards[result.index]?.type ?? ''
  };
}

const commands: CommandDef[] = [
  defineCommand({
    type: 'outpostAttack.start',
    payload: z.object({
      /** Start the attack from this event follow-up (index in ext.eventFollowUps). */
      followUp: z.number().int().min(0).optional(),
      attackValue: z.number().int().min(0).max(500).optional(),
      targetNumber: z.number().int().min(1).max(20).optional()
    }),
    run(rt, { followUp, attackValue, targetNumber }) {
      if (rt.ext.outpostAttack) {
        throw new CommandError('An outpost attack is already running');
      }
      deck(rt);
      let attack: EventCardAttack | undefined;
      let source: OutpostAttackState['source'];
      let attackChange = 0;
      let targetChange = 0;
      if (followUp !== undefined) {
        const entry = rt.ext.eventFollowUps?.[followUp];
        if (!entry?.outpostAttack) {
          throw new CommandError('That event has no outpost attack');
        }
        attack = entry.outpostAttack.attack;
        source = { type: entry.type, cardId: entry.cardId };
        for (const effect of entry.outpostAttack.effects) {
          const value = effect.values?.[0];
          if (value === undefined || typeof value === 'object') continue;
          if (effect.type === EventCardEffectType.outpostAttack) attackChange = EntityValueFunction(value);
          if (effect.type === EventCardEffectType.outpostTarget) targetChange = EntityValueFunction(value);
        }
      }
      const target = attack?.target;
      const state: OutpostAttackState = {
        ...(source ? { source } : {}),
        attackValue: attackValue ?? (attack ? EntityValueFunction(attack.attackValue) : 50) + attackChange,
        targetNumber: targetNumber ?? (attack ? EntityValueFunction(attack.targetNumber) : 4) + targetChange,
        ...(attack?.targetDescription ? { targetDescription: attack.targetDescription } : {}),
        ...(target ? { target } : {}),
        order: initialTargetOrder(target),
        attacks: 0,
        soldiers: 0,
        log: []
      };
      if (target?.randomize) {
        state.order = shuffle(state.order);
      }
      rt.game.party.buildings.forEach((b) => (b.attacked = undefined));
      rt.ext.outpostAttack = state;
      rt.log(`Outpost attack: attack ${state.attackValue}, ${state.targetNumber} targets`);
    }
  }),
  defineCommand({
    type: 'outpostAttack.setSoldiers',
    payload: z.object({ soldiers: z.number().int().min(0).max(10) }),
    run(rt, { soldiers }) {
      const state = attackState(rt);
      if (soldiers > rt.game.party.soldiers) {
        throw new CommandError(`The outpost only has ${rt.game.party.soldiers} soldiers`);
      }
      if (soldiers && (!outpostBuildings().some((b) => b.model.name === 'barracks') || drawFactor(soldiers) === 'disadvantage')) {
        throw new CommandError('Soldiers need working barracks');
      }
      state.soldiers = soldiers;
      delete state.result;
    }
  }),
  defineCommand({
    type: 'outpostAttack.reorder',
    payload: z.object({ order: z.array(z.string()) }),
    run(rt, { order }) {
      const state = attackState(rt);
      const known = new Set(outpostBuildings().map((b) => b.model.name));
      if (order.some((name) => !known.has(name)) || new Set(order).size !== order.length) {
        throw new CommandError('Unknown or duplicate building in order', 'invalid_payload');
      }
      const done = state.order.slice(0, state.attacks);
      if (done.some((name, i) => order[i] !== name)) {
        throw new CommandError("Buildings that were already attacked can't be moved", 'invalid_payload');
      }
      state.order = order;
    }
  }),
  defineCommand({
    type: 'outpostAttack.draw',
    payload: z.object({}),
    run(rt) {
      const state = attackState(rt);
      const tg = deck(rt);
      const factor = drawFactor(state.soldiers);
      rt.gm.stateManager.before('updateAttackModifierDeck.draw' + (factor ?? ''), 'party.campaign.townGuard');
      if (tg.current + (factor ? 2 : 1) > tg.cards.length - 1) {
        rt.gm.attackModifierManager.shuffleModifiers(tg);
      }
      rt.gm.attackModifierManager.drawModifier(tg, factor);
      rt.game.party.townGuardDeck = tg.toModel();
      rt.gm.stateManager.after();
      computeResult(rt, state);
    }
  }),
  defineCommand({
    type: 'outpostAttack.toggleResult',
    payload: z.object({}),
    run(rt) {
      const state = attackState(rt);
      if (state.result?.chooseOffset) {
        computeResult(rt, state, state.result.index + state.result.chooseOffset);
      }
    }
  }),
  defineCommand({
    type: 'outpostAttack.resolve',
    payload: z.object({ state: z.enum(['normal', 'damaged', 'wrecked']).optional() }),
    run(rt, { state: override }) {
      const state = attackState(rt);
      if (state.attacks >= state.targetNumber || state.attacks >= state.order.length) {
        throw new CommandError('All targets have been attacked');
      }
      const name = state.order[state.attacks]!;
      const building = rt.game.party.buildings.find((b) => b.name === name);
      const data = outpostBuildings().find((b) => b.model.name === name)?.data;
      if (!building || !data) {
        throw new CommandError(`The outpost has no ${name}`);
      }
      let next = building.state;
      if (override) {
        next = override;
      } else if (state.result) {
        if (state.result.type === 'wreck') {
          next = 'wrecked';
        } else if (state.result.type !== 'success' && state.result.value < currentAttackValue(state)) {
          next = 'damaged';
        }
      } else {
        throw new CommandError('Draw a town guard card first, or set the result by hand');
      }
      rt.gm.stateManager.before('buildingAttacked.' + next, data.id, data.name);
      state.log.push({ building: name, state: next, soldiers: state.soldiers, ...(state.result ? { result: state.result.value } : {}) });
      rt.game.party.soldiers -= state.soldiers;
      state.soldiers = 0;
      building.attacked = true;
      building.state = next;
      state.attacks++;
      delete state.result;
      if (state.target?.distance === 'previousTarget') {
        state.order = sortByPreviousTarget(state.order, state.attacks);
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'outpostAttack.finish',
    payload: z.object({}),
    run(rt) {
      const state = attackState(rt);
      const hits = state.log.filter((entry) => entry.state !== 'normal');
      rt.log(
        `Outpost attack finished: ${hits.length ? hits.map((entry) => `${entry.building} ${entry.state}`).join(', ') : 'no buildings damaged'}`
      );
      if (state.source) {
        const entry = rt.ext.eventFollowUps?.find((f) => f.type === state.source!.type && f.cardId === state.source!.cardId && f.outpostAttack);
        if (entry) delete entry.outpostAttack;
        rt.ext.eventFollowUps = rt.ext.eventFollowUps?.filter((f) => f.manual.length || f.distribution.length || f.outpostAttack);
        if (!rt.ext.eventFollowUps?.length) delete rt.ext.eventFollowUps;
      }
      rt.game.party.buildings.forEach((b) => (b.attacked = undefined));
      delete rt.ext.outpostAttack;
    }
  })
];

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export const outpostAttackCommands = commands;
