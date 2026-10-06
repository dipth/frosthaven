/**
 * In-scenario actions for physical (and online) play, ported from GHS UI
 * components (AGPL-3.0): character/character.ts and cards/initiative*.ts,
 * monster/*, standee/standee.ts, entities-menu helpers, attackmodifier/*,
 * loot/loot-deck.ts, footer/footer.ts, footer/level, footer/scenario,
 * footer/scenario-rules. Each command performs what the matching GHS UI action
 * does, with the same undo-info keys.
 */
import { Character, gameManager, GameState, Monster, settingsManager } from '@fh/ghs-core';
import { FigureNextCommand } from '@fh/ghs-core/vendor/game/commands/figure/FigureNext';
import { AttackModifier, AttackModifierType, type AttackModifierDeck } from '@fh/ghs-core/vendor/game/model/data/AttackModifier';
import { Condition, ConditionName, ConditionType } from '@fh/ghs-core/vendor/game/model/data/Condition';
import { Element, ElementState } from '@fh/ghs-core/vendor/game/model/data/Element';
import { AdditionalIdentifier, Identifier } from '@fh/ghs-core/vendor/game/model/data/Identifier';
import { LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { MonsterType } from '@fh/ghs-core/vendor/game/model/data/MonsterType';
import type { Entity } from '@fh/ghs-core/vendor/game/model/Entity';
import { EntityValueFunction } from '@fh/ghs-core/vendor/game/model/Entity';
import type { Figure } from '@fh/ghs-core/vendor/game/model/Figure';
import { MonsterEntity } from '@fh/ghs-core/vendor/game/model/MonsterEntity';
import { ObjectiveContainer } from '@fh/ghs-core/vendor/game/model/ObjectiveContainer';
import { ObjectiveEntity } from '@fh/ghs-core/vendor/game/model/ObjectiveEntity';
import { Summon, SummonColor, SummonState } from '@fh/ghs-core/vendor/game/model/Summon';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { ruleRooms, ruleSections } from '../ghs-ui/scenario-rules';
import { ScenarioSummary } from '../ghs-ui/scenario-summary';
import { CommandError, defineCommand, type CommandContext, type CommandDef, type Runtime } from '../runtime';
import { characterKey, type CampaignState } from '../state';

// ---------------------------------------------------------------------------
// References to figures and entities
// ---------------------------------------------------------------------------

export const figureRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character'), edition: z.string(), name: z.string() }),
  z.object({ kind: z.literal('monster'), edition: z.string(), name: z.string() }),
  z.object({ kind: z.literal('objective'), uuid: z.string() })
]);
export type FigureRef = z.infer<typeof figureRef>;

export const entityRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character'), edition: z.string(), name: z.string() }),
  z.object({ kind: z.literal('summon'), edition: z.string(), name: z.string(), uuid: z.string() }),
  z.object({ kind: z.literal('monster'), edition: z.string(), name: z.string(), number: z.number().int(), type: z.string().optional() }),
  z.object({ kind: z.literal('objective'), uuid: z.string(), number: z.number().int() })
]);
export type EntityRef = z.infer<typeof entityRef>;

export function resolveFigure(rt: Runtime, ref: FigureRef): Figure {
  const figure = rt.game.figures.find((f) => {
    if (ref.kind === 'character') return f instanceof Character && f.edition === ref.edition && f.name === ref.name;
    if (ref.kind === 'monster') return f instanceof Monster && f.edition === ref.edition && f.name === ref.name;
    return f instanceof ObjectiveContainer && f.uuid === ref.uuid;
  });
  if (!figure) {
    throw new CommandError('That figure is not in the scenario');
  }
  return figure;
}

export function resolveEntity(rt: Runtime, ref: EntityRef): { figure: Figure; entity: Entity } {
  if (ref.kind === 'character') {
    const figure = resolveFigure(rt, ref) as Character;
    return { figure, entity: figure };
  }
  if (ref.kind === 'summon') {
    const figure = resolveFigure(rt, { kind: 'character', edition: ref.edition, name: ref.name }) as Character;
    const entity = figure.summons.find((s) => s.uuid === ref.uuid);
    if (!entity) throw new CommandError('That summon is gone');
    return { figure, entity };
  }
  if (ref.kind === 'monster') {
    const figure = resolveFigure(rt, { kind: 'monster', edition: ref.edition, name: ref.name }) as Monster;
    const entity = figure.entities.find((e) => e.number === ref.number && (!ref.type || e.type === ref.type));
    if (!entity) throw new CommandError(`No standee ${ref.number}`);
    return { figure, entity };
  }
  const figure = resolveFigure(rt, { kind: 'objective', uuid: ref.uuid }) as ObjectiveContainer;
  const entity = figure.entities.find((e) => e.number === ref.number);
  if (!entity) throw new CommandError('No such objective');
  return { figure, entity };
}

function figureLabel(figure: Figure): string {
  if (figure instanceof Character) return gameManager.characterManager.characterName(figure, true, true);
  if (figure instanceof Monster) return 'data.monster.' + figure.name;
  return (figure as ObjectiveContainer).title || 'objective';
}

/** Players control their own characters and summons; monsters and objectives are shared. */
function ownedCharacterKey(ref: FigureRef | EntityRef): string | undefined {
  return ref.kind === 'character' || ref.kind === 'summon' ? `${ref.edition}:${ref.name}` : undefined;
}

export function assertControl(state: CampaignState, refs: (FigureRef | EntityRef)[], ctx: CommandContext) {
  if (ctx.isAdmin) return;
  for (const ref of refs) {
    const key = ownedCharacterKey(ref);
    const owner = key && state.ext.characterOwners[key];
    if (owner && owner !== ctx.userId) {
      throw new CommandError(`${key} belongs to another player`, 'forbidden');
    }
  }
}

function assertScenario(rt: Runtime) {
  if (!rt.game.scenario) throw new CommandError('No scenario in progress');
}

/** Removes dead monster standees, summons and objectives (GHS health helper). */
function removeDead(rt: Runtime, targets: { figure: Figure; entity: Entity }[]) {
  for (const { figure, entity } of targets) {
    const dead = (entity instanceof MonsterEntity || entity instanceof Summon || entity instanceof ObjectiveEntity) && entity.dead;
    if (!dead) continue;
    if (figure instanceof Monster && entity instanceof MonsterEntity) {
      rt.gm.monsterManager.removeMonsterEntity(figure, entity);
    } else if (figure instanceof Character && entity instanceof Summon) {
      rt.gm.characterManager.removeSummon(figure, entity);
    } else if (figure instanceof ObjectiveContainer && entity instanceof ObjectiveEntity) {
      rt.gm.objectiveManager.removeObjectiveEntity(figure, entity);
    }
    if ((figure instanceof Monster || figure instanceof ObjectiveContainer) && figure.active && figure.entities.every((e) => !rt.gm.entityManager.isAlive(e))) {
      rt.gm.roundManager.toggleFigure(figure);
    }
  }
}

// ---------------------------------------------------------------------------
// Attack modifier decks
// ---------------------------------------------------------------------------

const deckRef = z.union([z.literal('monster'), z.literal('ally'), z.object({ kind: z.literal('character'), edition: z.string(), name: z.string() })]);
type DeckRef = z.infer<typeof deckRef>;

function resolveDeck(rt: Runtime, ref: DeckRef): { deck: AttackModifierDeck; character?: Character; label: string } {
  if (ref === 'monster') return { deck: rt.game.monsterAttackModifierDeck, label: 'monster' };
  if (ref === 'ally') return { deck: rt.game.allyAttackModifierDeck, label: 'ally' };
  const character = resolveFigure(rt, ref) as Character;
  return { deck: character.attackModifierDeck, character, label: rt.gm.characterManager.characterName(character, true, true) };
}

function assertDeckControl(state: CampaignState, ref: DeckRef, ctx: CommandContext) {
  if (typeof ref === 'object') assertControl(state, [ref], ctx);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const targets = z.array(entityRef).min(1).max(40);

const commands: CommandDef[] = [
  // --- round & turns -------------------------------------------------------
  defineCommand({
    type: 'round.next',
    payload: z.object({ force: z.boolean().default(false) }),
    run(rt, { force }) {
      if (rt.game.state === GameState.draw && !force && !rt.gm.roundManager.drawAvailable()) {
        throw new CommandError('Not all characters have chosen an initiative');
      }
      rt.gm.stateManager.before(rt.game.state === GameState.next ? 'nextRound' : 'draw');
      if (rt.game.state === GameState.next) {
        let lastActive = rt.game.figures.find((figure) => rt.gm.gameplayFigure(figure) && !figure.off);
        while (lastActive) {
          rt.gm.roundManager.toggleFigure(lastActive, true);
          lastActive = rt.game.figures.find((figure) => rt.gm.gameplayFigure(figure) && !figure.off);
        }
      }
      rt.gm.roundManager.nextGameState(force);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'figure.next',
    payload: z.object({ reverse: z.boolean().default(false) }),
    run(rt, { reverse }) {
      if (rt.game.state !== GameState.next) throw new CommandError('Draw first');
      rt.gm.stateManager.before('command.figure.next');
      new FigureNextCommand().executeWithParameters(reverse);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'figure.toggleTurn',
    payload: z.object({ figure: figureRef }),
    run(rt, { figure: ref }) {
      if (rt.game.state !== GameState.next) throw new CommandError('Draw first');
      const figure = resolveFigure(rt, ref);
      if (figure instanceof Character) {
        if (figure.absent || figure.exhausted) throw new CommandError('That character is not taking turns');
        const activeSummon = figure.summons.find((summon) => summon.active);
        const summonsAfterTurn = figure.summons.filter((summon) => summon.afterTurn);
        if (settingsManager.settings.activeSummons && !activeSummon && figure.active && summonsAfterTurn.length && !summonsAfterTurn.find((s) => s.active)) {
          rt.gm.stateManager.before('summonInactive', figureLabel(figure), 'data.summon.' + summonsAfterTurn[0]!.name);
          summonsAfterTurn.forEach((spirit) => (spirit.afterTurnActive = true));
        } else if (settingsManager.settings.activeSummons && figure.active && activeSummon) {
          rt.gm.stateManager.before('summonInactive', figureLabel(figure), 'data.summon.' + activeSummon.name);
        } else {
          rt.gm.stateManager.before(figure.active ? 'unsetActive' : 'setActive', figureLabel(figure));
        }
      } else if (figure instanceof Monster) {
        if (!rt.gm.monsterManager.monsterEntityCount(figure)) throw new CommandError('No standees on the map');
        rt.gm.stateManager.before(figure.active ? 'unsetActive' : 'setActive', 'data.monster.' + figure.name);
      } else {
        rt.gm.stateManager.before(figure.active ? 'unsetActive' : 'setActive', figureLabel(figure));
      }
      rt.gm.roundManager.toggleFigure(figure);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'character.initiative',
    payload: z.object({ edition: z.string(), name: z.string(), initiative: z.number().int().min(0).max(99) }),
    authorize: (state, p, ctx) => assertControl(state, [{ kind: 'character', edition: p.edition, name: p.name }], ctx),
    run(rt, { edition, name, initiative }) {
      const character = resolveFigure(rt, { kind: 'character', edition, name }) as Character;
      if (rt.game.state !== GameState.draw && settingsManager.settings.initiativeRequired && initiative <= 0) {
        throw new CommandError('Initiative is required');
      }
      rt.gm.entityManager.before(character, character, 'setInitiative', initiative);
      character.initiativeVisible = true;
      if (character.name !== 'prism' || !character.tags.includes('long_rest')) {
        character.longRest = false;
      }
      if (initiative === 99) {
        character.longRest = true;
      }
      character.initiative = initiative;
      if (rt.game.state === GameState.next) {
        rt.gm.sortFigures(character);
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'character.longRest',
    payload: z.object({ edition: z.string(), name: z.string(), on: z.boolean() }),
    authorize: (state, p, ctx) => assertControl(state, [{ kind: 'character', edition: p.edition, name: p.name }], ctx),
    run(rt, { edition, name, on }) {
      const character = resolveFigure(rt, { kind: 'character', edition, name }) as Character;
      if (!on) {
        rt.gm.stateManager.before('characterLongRestOff', figureLabel(character));
        character.longRest = false;
      } else {
        rt.gm.stateManager.before('characterLongRest', figureLabel(character));
        if (character.initiative !== 99 && !(character.name === 'prism' && character.tags.includes('long_rest'))) {
          character.initiative = 99;
        }
        character.longRest = true;
      }
      if (rt.game.state === GameState.next) {
        rt.gm.sortFigures(character);
      }
      rt.gm.stateManager.after();
    }
  }),

  // --- health, conditions, death ------------------------------------------
  defineCommand({
    type: 'entity.changeHealth',
    payload: z.object({ targets, delta: z.number().int().min(-99).max(99) }),
    // Anyone may deal damage (monsters attack characters); healing is the owner's.
    authorize: (state, p, ctx) => p.delta < 0 || assertControl(state, p.targets, ctx),
    run(rt, { targets: refs, delta }) {
      if (delta === 0) return;
      const resolved = refs.map((ref) => resolveEntity(rt, ref));
      const first = resolved[0]!;
      rt.gm.entityManager.beforeEntities(resolved.length === 1 ? first.entity : undefined, resolved.length === 1 ? first.figure : undefined, resolved.map((r) => r.entity), 'changeHP', (delta > 0 ? '+' : '') + delta);
      resolved.forEach(({ figure, entity }) => rt.gm.entityManager.changeHealth(entity, figure, delta));
      removeDead(rt, resolved);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'entity.changeMaxHealth',
    payload: z.object({ targets, delta: z.number().int().min(-99).max(99) }),
    authorize: (state, p, ctx) => assertControl(state, p.targets, ctx),
    run(rt, { targets: refs, delta }) {
      const resolved = refs.map((ref) => resolveEntity(rt, ref));
      rt.gm.entityManager.beforeEntities(undefined, undefined, resolved.map((r) => r.entity), 'changeMaxHP', (delta > 0 ? '+' : '') + delta);
      resolved.forEach(({ entity }) => {
        const max = EntityValueFunction(entity.maxHealth);
        const next = Math.max(1, max + delta);
        if (entity.health === max) entity.health += next - max;
        entity.maxHealth = next;
        if (entity.health > entity.maxHealth) entity.health = entity.maxHealth;
      });
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'entity.kill',
    payload: z.object({ targets }),
    authorize: (state, p, ctx) => assertControl(state, p.targets, ctx),
    run(rt, { targets: refs }) {
      const resolved = refs.map((ref) => resolveEntity(rt, ref));
      const single = resolved.length === 1 ? resolved[0]! : undefined;
      const info = single?.entity instanceof Character ? (single.entity.exhausted ? 'notExhausted' : 'exhausted') : 'dead';
      rt.gm.entityManager.beforeEntities(single?.entity, single?.figure, resolved.map((r) => r.entity), info);
      resolved.forEach(({ entity }) => {
        if (entity instanceof MonsterEntity || entity instanceof Summon || entity instanceof ObjectiveEntity) {
          entity.dead = true;
        } else if (entity instanceof Character) {
          entity.exhausted = !entity.exhausted;
          if (entity.exhausted && settingsManager.settings.scenarioStats) {
            entity.scenarioStats.exhausts += 1;
          }
        }
      });
      removeDead(rt, resolved);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'entity.addCondition',
    payload: z.object({ targets, condition: z.string(), value: z.number().int().min(1).max(20).default(1), permanent: z.boolean().default(false) }),
    // Attacks inflict conditions on other players' figures too.
    run(rt, { targets: refs, condition: name, value, permanent }) {
      if (!Object.values(ConditionName).includes(name as ConditionName)) {
        throw new CommandError(`Unknown condition ${name}`, 'invalid_payload');
      }
      const resolved = refs.map((ref) => resolveEntity(rt, ref));
      const single = resolved.length === 1 ? resolved[0]! : undefined;
      rt.gm.entityManager.beforeEntities(single?.entity, single?.figure, resolved.map((r) => r.entity), 'addCondition', name);
      resolved.forEach(({ figure, entity }) => {
        const condition = new Condition(name as ConditionName, value);
        const shacklesImmunity =
          entity instanceof Character &&
          entity.name === 'shackles' &&
          !entity.absent &&
          entity.tags.includes('delayed_malady') &&
          condition.types.includes(ConditionType.negative) &&
          !condition.types.includes(ConditionType.amDeck);
        let applied = condition;
        if (
          entity instanceof Character &&
          condition.name === ConditionName.muddle &&
          entity.progress.equippedItems.find((identifier) => identifier.edition === 'gh' && identifier.name === '108')
        ) {
          applied = new Condition(ConditionName.strengthen, value);
        }
        rt.gm.entityManager.addCondition(entity, figure, applied, permanent, shacklesImmunity);
        if (shacklesImmunity && !entity.immunities.includes(condition.name)) {
          entity.immunities.push(condition.name);
        }
      });
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'entity.removeCondition',
    payload: z.object({ targets, condition: z.string(), permanent: z.boolean().default(false) }),
    authorize: (state, p, ctx) => assertControl(state, p.targets, ctx),
    run(rt, { targets: refs, condition: name, permanent }) {
      const resolved = refs.map((ref) => resolveEntity(rt, ref));
      const single = resolved.length === 1 ? resolved[0]! : undefined;
      rt.gm.entityManager.beforeEntities(single?.entity, single?.figure, resolved.map((r) => r.entity), 'removeCondition', name);
      resolved.forEach(({ figure, entity }) => {
        const condition = new Condition(name as ConditionName);
        if (rt.gm.entityManager.hasCondition(entity, condition, permanent)) {
          rt.gm.entityManager.removeCondition(entity, figure, condition, permanent);
        }
      });
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'entity.setShield',
    payload: z.object({ targets, value: z.number().int().min(0).max(20), persistent: z.boolean().default(false) }),
    authorize: (state, p, ctx) => assertControl(state, p.targets, ctx),
    run(rt, { targets: refs, value, persistent }) {
      const resolved = refs.map((ref) => resolveEntity(rt, ref));
      rt.gm.entityManager.beforeEntities(undefined, undefined, resolved.map((r) => r.entity), persistent ? 'setShieldPersistent' : 'setShield', value);
      resolved.forEach(({ entity }) => {
        const action = value > 0 ? Object.assign({ type: 'shield', value, valueType: 'fixed', subActions: [] }) : undefined;
        if (persistent) entity.shieldPersistent = action;
        else entity.shield = action;
      });
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'entity.setRetaliate',
    payload: z.object({ targets, value: z.number().int().min(0).max(20), range: z.number().int().min(1).max(10).default(1), persistent: z.boolean().default(false) }),
    authorize: (state, p, ctx) => assertControl(state, p.targets, ctx),
    run(rt, { targets: refs, value, range, persistent }) {
      const resolved = refs.map((ref) => resolveEntity(rt, ref));
      rt.gm.entityManager.beforeEntities(undefined, undefined, resolved.map((r) => r.entity), persistent ? 'setRetaliatePersistent' : 'setRetaliate', value);
      resolved.forEach(({ entity }) => {
        const actions =
          value > 0
            ? [
                Object.assign({
                  type: 'retaliate',
                  value,
                  valueType: 'fixed',
                  subActions: range > 1 ? [{ type: 'range', value: range, valueType: 'fixed', subActions: [], small: true }] : []
                })
              ]
            : [];
        if (persistent) entity.retaliatePersistent = actions;
        else entity.retaliate = actions;
      });
      rt.gm.stateManager.after();
    }
  }),

  // --- character scenario values ------------------------------------------
  defineCommand({
    type: 'character.changeScenarioXP',
    payload: z.object({ edition: z.string(), name: z.string(), delta: z.number().int().min(-99).max(99) }),
    authorize: (state, p, ctx) => assertControl(state, [{ kind: 'character', edition: p.edition, name: p.name }], ctx),
    run(rt, { edition, name, delta }) {
      const character = resolveFigure(rt, { kind: 'character', edition, name }) as Character;
      rt.gm.entityManager.before(character, character, 'changeXP', (delta > 0 ? '+' : '') + delta);
      character.experience = Math.max(0, character.experience + delta);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'character.changeScenarioLoot',
    payload: z.object({ edition: z.string(), name: z.string(), delta: z.number().int().min(-99).max(99) }),
    authorize: (state, p, ctx) => assertControl(state, [{ kind: 'character', edition: p.edition, name: p.name }], ctx),
    run(rt, { edition, name, delta }) {
      const character = resolveFigure(rt, { kind: 'character', edition, name }) as Character;
      rt.gm.entityManager.before(character, character, 'changeLoot', (delta > 0 ? '+' : '') + delta);
      character.loot = Math.max(0, character.loot + delta);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'character.setToken',
    payload: z.object({ edition: z.string(), name: z.string(), index: z.number().int().min(-1).max(5), value: z.number().int().min(0).max(99) }),
    authorize: (state, p, ctx) => assertControl(state, [{ kind: 'character', edition: p.edition, name: p.name }], ctx),
    run(rt, { edition, name, index, value }) {
      const character = resolveFigure(rt, { kind: 'character', edition, name }) as Character;
      if (index === -1) {
        rt.gm.stateManager.before('characterToken', character.name, value);
        character.token = value;
      } else {
        if (!character.tokens[index]) throw new CommandError('Unknown token', 'invalid_payload');
        rt.gm.stateManager.before('characterTokenValue', character.name, character.tokens[index]!, value);
        character.tokenValues[index] = value;
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'character.setIdentity',
    payload: z.object({ edition: z.string(), name: z.string(), identity: z.number().int().min(0).max(5) }),
    authorize: (state, p, ctx) => assertControl(state, [{ kind: 'character', edition: p.edition, name: p.name }], ctx),
    run(rt, { edition, name, identity }) {
      const character = resolveFigure(rt, { kind: 'character', edition, name }) as Character;
      if (!character.identities?.[identity]) throw new CommandError('Unknown identity', 'invalid_payload');
      rt.gm.stateManager.before('setIdentity', figureLabel(character), character.identities[identity]!);
      character.identity = identity;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'summon.add',
    payload: z.object({
      edition: z.string(),
      name: z.string(),
      summon: z.object({ name: z.string(), cardId: z.string().optional() }).optional(),
      customName: z.string().max(40).optional(),
      number: z.number().int().min(0).max(12).default(1),
      color: z.enum(Object.values(SummonColor) as [SummonColor, ...SummonColor[]]).default(SummonColor.blue)
    }),
    authorize: (state, p, ctx) => assertControl(state, [{ kind: 'character', edition: p.edition, name: p.name }], ctx),
    run(rt, { edition, name, summon: which, customName, number, color }) {
      const character = resolveFigure(rt, { kind: 'character', edition, name }) as Character;
      if (which) {
        const candidates = [
          ...character.availableSummons.filter((s) => !s.level || s.level <= character.level),
          ...character.progress.items
            .map((i) => rt.gm.itemManager.getItem(i.name, i.edition, true))
            .filter((item) => item?.summon)
            .map((item) => ({ ...item!.summon!, name: item!.summon!.name || item!.name, count: item!.summon!.count || 1 }))
        ];
        const data = candidates.find((s) => s.name === which.name && (!which.cardId || s.cardId === which.cardId));
        if (!data) throw new CommandError(`Unknown summon ${which.name}`, 'invalid_payload');
        rt.gm.stateManager.before('addSummon', figureLabel(character), 'data.summon.' + data.name);
        const summon = new Summon(uuidv4(), data.name, data.cardId, character.level, data.special ? 0 : number, data.special ? SummonColor.custom : color, data);
        summon.state = data.special ? SummonState.true : SummonState.new;
        summon.init = false;
        rt.gm.characterManager.addSummon(character, summon);
      } else {
        if (!customName) throw new CommandError('Choose a summon or give it a name', 'invalid_payload');
        rt.gm.stateManager.before('addCustomSummon', figureLabel(character), number, color);
        const summon = new Summon(uuidv4(), customName, '', character.level, number, color);
        summon.state = SummonState.new;
        rt.gm.characterManager.addSummon(character, summon);
      }
      rt.gm.stateManager.after();
    }
  }),

  // --- monsters ------------------------------------------------------------
  defineCommand({
    type: 'monster.addStandee',
    payload: z.object({
      edition: z.string(),
      name: z.string(),
      type: z.enum([MonsterType.normal, MonsterType.elite, MonsterType.boss]),
      number: z.number().int().min(1).max(20).optional(),
      summon: z.boolean().default(false)
    }),
    run(rt, { edition, name, type, number, summon }) {
      assertScenario(rt);
      let monster = rt.game.figures.find((f): f is Monster => f instanceof Monster && f.edition === edition && f.name === name);
      if (!monster) {
        monster = rt.gm.monsterManager.addMonsterByName(name, edition);
        if (!monster) throw new CommandError(`Unknown monster ${name}`, 'invalid_payload');
      }
      const max = rt.gm.monsterManager.monsterStandeeMax(monster);
      const pick = number ?? (settingsManager.settings.randomStandees ? rt.gm.monsterManager.monsterRandomStandee(monster) : nextFreeStandee(rt, monster, max));
      if (!pick || pick < 1 || pick > max) throw new CommandError('All standees are on the map');
      if (rt.gm.monsterManager.monsterStandeeUsed(monster, pick)) throw new CommandError(`Standee ${pick} is already on the map`);
      rt.gm.stateManager.before(number ? 'addStandee' : 'addNextStandee', 'data.monster.' + monster.name, 'monster.' + type, pick);
      const dead = monster.entities.find((e) => e.number === pick);
      if (dead) rt.gm.monsterManager.removeMonsterEntity(monster, dead);
      const entity = rt.gm.monsterManager.addMonsterEntity(monster, pick, type, summon);
      if (rt.game.state === GameState.next && entity) {
        monster.active = !rt.game.figures.some((figure) => figure.active);
        if (monster.active) {
          rt.gm.sortFigures(monster);
          entity.active = true;
        }
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'monster.changeStandeeNumber',
    payload: z.object({ standee: entityRef, number: z.number().int().min(1).max(20) }),
    run(rt, { standee, number }) {
      const { figure, entity } = resolveEntity(rt, standee);
      if (!(figure instanceof Monster) || !(entity instanceof MonsterEntity)) throw new CommandError('Not a monster standee', 'invalid_payload');
      rt.gm.entityManager.before(entity, figure, 'changeEntityNumber', entity.type, entity.number, number);
      const existing = rt.gm.monsterManager.monsterStandeeUsed(figure, number);
      if (existing) {
        let otherNumber = -1;
        while (rt.gm.monsterManager.monsterStandeeUsed(figure, otherNumber)) otherNumber -= 1;
        existing.number = otherNumber;
      }
      entity.number = number;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'monster.toggleType',
    payload: z.object({ standee: entityRef }),
    run(rt, { standee }) {
      const { figure, entity } = resolveEntity(rt, standee);
      if (!(figure instanceof Monster) || !(entity instanceof MonsterEntity) || entity.type === MonsterType.boss) {
        throw new CommandError('Only normal/elite standees can switch type', 'invalid_payload');
      }
      rt.gm.stateManager.before(
        'changeMonsterType',
        'data.monster.' + figure.name,
        'monster.' + entity.type,
        entity.number,
        entity.type === MonsterType.normal ? MonsterType.elite : MonsterType.normal
      );
      rt.gm.monsterManager.changeType(entity, figure);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'monster.add',
    payload: z.object({ edition: z.string().default('fh'), name: z.string() }),
    run(rt, { edition, name }) {
      assertScenario(rt);
      rt.gm.stateManager.before('addMonster', 'data.monster.' + name);
      const monster = rt.gm.monsterManager.addMonsterByName(name, edition);
      if (!monster) throw new CommandError(`Unknown monster ${name}`, 'invalid_payload');
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'monster.remove',
    payload: z.object({ edition: z.string(), name: z.string() }),
    run(rt, ref) {
      const monster = resolveFigure(rt, { kind: 'monster', ...ref }) as Monster;
      rt.gm.stateManager.before('removeMonster', 'data.monster.' + monster.name);
      rt.gm.monsterManager.removeMonster(monster);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'monster.setLevel',
    payload: z.object({ edition: z.string(), name: z.string(), level: z.number().int().min(0).max(7) }),
    run(rt, { level, ...ref }) {
      const monster = resolveFigure(rt, { kind: 'monster', ...ref }) as Monster;
      rt.gm.stateManager.before('setLevel', 'data.monster.' + monster.name, level);
      rt.gm.monsterManager.setLevel(monster, level);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'monster.toggleAlly',
    payload: z.object({ edition: z.string(), name: z.string() }),
    run(rt, ref) {
      const monster = resolveFigure(rt, { kind: 'monster', ...ref }) as Monster;
      rt.gm.stateManager.before(monster.isAlly ? 'unsetAlly' : 'setAlly', 'data.monster.' + monster.name);
      monster.isAlly = !monster.isAlly;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'monster.shuffleAbilities',
    payload: z.object({ edition: z.string(), name: z.string() }),
    run(rt, ref) {
      const monster = resolveFigure(rt, { kind: 'monster', ...ref }) as Monster;
      rt.gm.stateManager.before('shuffleAbilityDeck', 'data.monster.' + monster.name);
      rt.gm.monsterManager.shuffleAbilities(monster);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'monster.drawAbility',
    payload: z.object({ edition: z.string(), name: z.string() }),
    run(rt, ref) {
      const monster = resolveFigure(rt, { kind: 'monster', ...ref }) as Monster;
      rt.gm.stateManager.before('drawAbility', 'data.monster.' + monster.name);
      rt.gm.monsterManager.drawAbility(monster);
      rt.gm.stateManager.after();
    }
  }),

  // --- elements ------------------------------------------------------------
  defineCommand({
    type: 'element.set',
    payload: z.object({
      element: z.enum([Element.fire, Element.ice, Element.air, Element.earth, Element.light, Element.dark]),
      state: z.enum([ElementState.strong, ElementState.waning, ElementState.inert, ElementState.new, ElementState.consumed]).optional()
    }),
    run(rt, { element, state }) {
      const model = rt.game.elementBoard.find((e) => e.type === element);
      if (!model) throw new CommandError('Unknown element', 'invalid_payload');
      const next = state ?? rt.gm.nextElementState(model);
      rt.gm.stateManager.before('updateElement', 'game.element.' + element, 'game.element.state.' + next);
      rt.gm.applyElementState(model, next);
      rt.gm.stateManager.after();
    }
  }),

  // --- attack modifier decks -----------------------------------------------
  defineCommand({
    type: 'am.draw',
    payload: z.object({ deck: deckRef, state: z.enum(['advantage', 'disadvantage']).optional() }),
    authorize: (state, p, ctx) => assertDeckControl(state, p.deck, ctx),
    run(rt, { deck: ref, state }) {
      const { deck, character, label } = resolveDeck(rt, ref);
      if (deck.current >= deck.cards.length - 1) {
        rt.gm.stateManager.before('updateAttackModifierDeck.shuffle', label);
        rt.gm.attackModifierManager.shuffleModifiers(deck);
      } else {
        rt.gm.stateManager.before('updateAttackModifierDeck.draw' + (state ?? ''), label);
      }
      rt.gm.attackModifierManager.drawModifier(deck, state, character);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'am.shuffle',
    payload: z.object({ deck: deckRef, upcoming: z.boolean().default(false) }),
    authorize: (state, p, ctx) => assertDeckControl(state, p.deck, ctx),
    run(rt, { deck: ref, upcoming }) {
      const { deck, label } = resolveDeck(rt, ref);
      rt.gm.stateManager.before('updateAttackModifierDeck.shuffle' + (upcoming ? 'Upcoming' : ''), label);
      rt.gm.attackModifierManager.shuffleModifiers(deck, upcoming);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'am.changeCount',
    payload: z.object({
      deck: deckRef,
      type: z.enum([AttackModifierType.bless, AttackModifierType.curse, AttackModifierType.minus1extra]),
      delta: z.number().int().min(-10).max(10)
    }),
    run(rt, { deck: ref, type, delta }) {
      const { deck, character, label } = resolveDeck(rt, ref);
      rt.gm.stateManager.before('updateAttackModifierDeck.changeAttackModifier', label, 'game.attackModifiers.types.' + type, delta);
      if (delta > 0) {
        const upcoming = deck.cards.filter((am, index) => am.type === type && index > deck.current).length;
        const limit = type === AttackModifierType.minus1extra ? 20 : 10;
        const count = Math.min(delta, Math.max(0, limit - upcoming));
        let batch: AttackModifier[] = [];
        if (type === AttackModifierType.bless) batch = rt.gm.attackModifierManager.getBless(count);
        else if (type === AttackModifierType.curse) batch = rt.gm.attackModifierManager.getCurse(!character && ref !== 'ally', count);
        else batch = rt.gm.attackModifierManager.getExtraMinus1(count);
        rt.gm.attackModifierManager.addModifierBatch(deck, batch);
      } else {
        for (let i = 0; i < -delta; i++) {
          const index = deck.cards.findIndex((am, idx) => am.type === type && idx > deck.current);
          if (index < 0) break;
          deck.cards.splice(index, 1);
        }
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'am.removeDrawnDiscards',
    payload: z.object({ deck: deckRef }),
    authorize: (state, p, ctx) => assertDeckControl(state, p.deck, ctx),
    run(rt, { deck: ref }) {
      const { deck, label } = resolveDeck(rt, ref);
      rt.gm.stateManager.before('updateAttackModifierDeck.removeDrawnDiscards', label);
      rt.gm.attackModifierManager.removeDrawnDiscards(deck);
      rt.gm.stateManager.after();
    }
  }),

  // --- loot ----------------------------------------------------------------
  defineCommand({
    type: 'loot.draw',
    payload: z.object({ character: z.object({ edition: z.string(), name: z.string() }).optional() }),
    run(rt, { character: ref }) {
      assertScenario(rt);
      const deck = rt.game.lootDeck;
      if (!deck.cards.length || deck.current + 1 >= deck.cards.length) throw new CommandError('The loot deck is empty');
      const character = ref
        ? (resolveFigure(rt, { kind: 'character', ...ref }) as Character)
        : rt.game.figures.find((f): f is Character => f instanceof Character && f.active);
      rt.gm.stateManager.before('lootDeckDraw');
      const randomItem = rt.gm.lootManager.drawCard(deck, character);
      if (randomItem && character) {
        // GHS asks to confirm the random item; we take it (it can be removed from the sheet).
        rt.gm.itemManager.addItemCount(randomItem);
        if (!character.lootCards.includes(deck.current)) {
          character.lootCards.push(deck.current);
          character.lootCards.sort((a, b) => a - b);
        }
        if (character.progress.items.find((existing) => existing.name === '' + randomItem.id && existing.edition === randomItem.edition)) {
          character.progress.gold += rt.gm.itemManager.itemSellValue(randomItem);
          rt.log(`${rt.gm.characterManager.characterName(character)} already owns ${randomItem.name}; sold it`);
        } else {
          const identifier = new Identifier(randomItem.id, randomItem.edition);
          character.progress.items.push(identifier);
          character.progress.equippedItems.push(new AdditionalIdentifier(identifier.name, identifier.edition, undefined, 'loot-random-item'));
          rt.log(`${rt.gm.characterManager.characterName(character)} found ${randomItem.name} (item ${randomItem.id})`);
        }
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'loot.assign',
    payload: z.object({ index: z.number().int().min(0), character: z.object({ edition: z.string(), name: z.string() }) }),
    run(rt, { index, character: ref }) {
      const character = resolveFigure(rt, { kind: 'character', ...ref }) as Character;
      const loot = rt.game.lootDeck.cards[index];
      if (!loot || index > rt.game.lootDeck.current) throw new CommandError('That loot card has not been drawn');
      rt.game.figures.forEach((f) => {
        if (f instanceof Character && f !== character) f.lootCards = f.lootCards.filter((i) => i !== index);
      });
      if (character.lootCards.includes(index)) return;
      rt.gm.stateManager.before(loot.type === LootType.random_item ? 'lootRandomItem' : 'addResource', figureLabel(character), 'game.loot.' + loot.type, rt.gm.lootManager.getValue(loot));
      rt.gm.lootManager.applyLoot(loot, character, index);
      rt.gm.stateManager.after();
    }
  }),

  // --- scenario ------------------------------------------------------------
  defineCommand({
    type: 'scenario.setLevel',
    payload: z.object({ level: z.number().int().min(0).max(7).optional(), automatic: z.boolean().default(false) }),
    run(rt, { level, automatic }) {
      if (automatic) {
        rt.gm.stateManager.before('updateLevelCalculation', true);
        rt.game.levelCalculation = true;
        rt.gm.levelManager.calculateScenarioLevel();
      } else {
        if (level === undefined) throw new CommandError('Level required', 'invalid_payload');
        rt.gm.stateManager.before('setScenarioLevel', level);
        rt.gm.levelManager.setLevel(level);
        rt.game.levelCalculation = false;
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'scenario.openRoom',
    payload: z.object({ roomNumber: z.number().int() }),
    run(rt, { roomNumber }) {
      assertScenario(rt);
      const scenario = rt.game.scenario!;
      const room = rt.gm.scenarioManager.closedRooms().find((r) => r.roomNumber === roomNumber);
      if (!room) throw new CommandError('That room is already open or does not exist');
      rt.gm.stateManager.before(room.marker ? 'openRoomMarker' : 'openRoom', scenario.index, rt.gm.scenarioManager.scenarioTitle(scenario), room.ref, room.marker || '');
      rt.gm.scenarioManager.openRoom(room, scenario, false);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'scenario.addSection',
    payload: z.object({ index: z.string() }),
    run(rt, { index }) {
      assertScenario(rt);
      const section = rt.gm.scenarioManager.availableSections().find((s) => s.index === index);
      if (!section) throw new CommandError(`Section ${index} is not available now`);
      if (section.conclusion) throw new CommandError(`Section ${index} is a conclusion; finish the scenario with it`);
      rt.gm.stateManager.before('addSection', section.index, rt.gm.scenarioManager.scenarioTitle(section, true), 'data.edition.' + section.edition);
      rt.gm.scenarioManager.addSection(section);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'scenario.applyRule',
    payload: z.object({ index: z.number().int().min(0) }),
    run(rt, { index }) {
      const ruleModel = rt.game.scenarioRules[index];
      if (!ruleModel) throw new CommandError('That rule is gone');
      const { rule, identifier } = ruleModel;
      const scenario = rt.gm.scenarioRulesManager.getScenarioForRule(identifier).scenario;
      if (!scenario) throw new CommandError('No scenario for that rule');
      rt.gm.stateManager.before('applyScenarioRule');
      const rooms = ruleRooms(index);
      const sections = ruleSections(index);
      if (!rule.alwaysApplyTurn) {
        rt.gm.scenarioRulesManager.applyRule(rule, identifier);
        rooms.forEach((roomData) => rt.gm.scenarioManager.openRoom(roomData, scenario, identifier.section));
        sections.forEach((sectionData) => {
          if (sectionData.conclusion) {
            rt.log(`Finish the scenario with conclusion §${sectionData.index}`);
          } else {
            rt.gm.scenarioManager.addSection(sectionData);
          }
        });
        if (rule.finish === 'won' || rule.finish === 'lost') {
          rt.log(rule.finish === 'won' ? 'The scenario is won: finish it to collect rewards' : 'The scenario is lost');
        }
      }
      if (rule.once || rule.alwaysApply || rule.alwaysApplyTurn) rt.game.appliedScenarioRules.push(identifier);
      if (rule.active) rt.game.activeScenarioRules.push(identifier);
      rt.game.scenarioRules.splice(index, 1);
      if (rule.finish === 'round') {
        rt.gm.roundManager.nextGameState();
        if (rt.game.state === GameState.next) rt.gm.roundManager.nextGameState();
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'scenario.dismissRule',
    payload: z.object({ index: z.number().int().min(0), hide: z.boolean().default(false) }),
    run(rt, { index, hide }) {
      const ruleModel = rt.game.scenarioRules[index];
      if (!ruleModel) throw new CommandError('That rule is gone');
      rt.gm.stateManager.before(hide ? 'hideScenarioRule' : 'removeScenarioRule');
      rt.game.scenarioRules.splice(index, 1);
      if (hide || ruleModel.rule.once || ruleModel.rule.alwaysApplyTurn || ruleModel.rule.alwaysApply) {
        rt.game.discardedScenarioRules.push(ruleModel.identifier);
      }
      if (!hide) {
        const id = ruleModel.identifier;
        rt.game.activeScenarioRules = rt.game.activeScenarioRules.filter(
          (a) => !(a.edition === id.edition && a.scenario === id.scenario && a.group === id.group && a.index === id.index && a.section === id.section)
        );
      }
      rt.gm.stateManager.after();
    }
  }),

  // --- finishing a scenario (GHS scenario summary dialog) ------------------
  defineCommand({
    type: 'finish.start',
    payload: z.object({ success: z.boolean(), conclusion: z.string().optional() }),
    run(rt, { success, conclusion }) {
      assertScenario(rt);
      const scenario = rt.game.scenario!;
      const conclusions = rt.gm.scenarioManager
        .availableSections(true)
        .filter((s) => s.edition === scenario.edition && s.parent === scenario.index && s.group === scenario.group && s.conclusion && rt.gm.scenarioManager.getRequirements(s).length === 0);
      const conclusionData = conclusion ? conclusions.find((c) => c.index === conclusion) : success && conclusions.length === 1 ? conclusions[0] : undefined;
      if (success && conclusions.length > 1 && !conclusionData) {
        throw new CommandError(`Choose the conclusion: ${conclusions.map((c) => c.index).join(', ')}`, 'invalid_payload');
      }
      rt.gm.stateManager.before('finishScenario.dialog', ...rt.gm.scenarioManager.scenarioUndoArgs());
      rt.game.finish = undefined;
      ScenarioSummary.open({ scenario, success, conclusion: conclusionData });
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'finish.update',
    payload: z.discriminatedUnion('op', [
      z.object({ op: z.literal('battleGoal'), index: z.number().int().min(0), value: z.number().int().min(1).max(3), checked: z.boolean() }),
      z.object({ op: z.literal('collectiveGold'), index: z.number().int().min(0), value: z.number().int().min(0) }),
      z.object({ op: z.literal('collectiveResource'), index: z.number().int().min(0), type: z.enum(Object.values(LootType) as [LootType, ...LootType[]]), value: z.number().int().min(0) }),
      z.object({ op: z.literal('item'), index: z.number().int().min(0), itemIndex: z.number().int().min(0) }),
      z.object({ op: z.literal('randomItem'), index: z.number().int().min(0) }),
      z.object({ op: z.literal('calendarSectionManual'), index: z.number().int().min(0), value: z.number().int().min(-1).max(80) }),
      z.object({ op: z.literal('chooseLocation'), value: z.string() }),
      z.object({ op: z.literal('chooseUnlockCharacter'), value: z.string() }),
      z.object({ op: z.literal('challenges'), value: z.number().int().min(0).max(2) }),
      z.object({ op: z.literal('trial'), index: z.number().int().min(0), checked: z.boolean() })
    ]),
    run(rt, change) {
      const summary = ScenarioSummary.fromGame();
      if (!summary) throw new CommandError('No scenario finish in progress');
      rt.gm.stateManager.before('finishScenario.dialog.' + change.op);
      switch (change.op) {
        case 'battleGoal':
          summary.setBattleGoal(change.index, change.value, change.checked);
          break;
        case 'collectiveGold':
          summary.setCollectiveGold(change.index, change.value);
          break;
        case 'collectiveResource':
          summary.setCollectiveResource(change.index, change.type, change.value);
          break;
        case 'item':
          summary.toggleItem(change.index, change.itemIndex);
          break;
        case 'randomItem':
          summary.toggleRandomItem(change.index);
          break;
        case 'calendarSectionManual':
          summary.setCalendarSectionManual(change.index, change.value);
          break;
        case 'chooseLocation':
          summary.selectLocation(change.value);
          break;
        case 'chooseUnlockCharacter':
          summary.selectCharacter(change.value);
          break;
        case 'challenges':
          summary.setChallenges(change.value);
          break;
        case 'trial':
          summary.toggleTrial(change.index, change.checked);
          break;
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'finish.cancel',
    payload: z.object({}),
    run(rt) {
      if (!rt.game.finish) return;
      rt.gm.stateManager.before('finishScenario.close', ...rt.gm.scenarioManager.scenarioUndoArgs());
      rt.game.finish = undefined;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'finish.apply',
    payload: z.object({ linked: z.string().optional(), restart: z.boolean().default(false) }),
    run(rt, { linked, restart }) {
      const summary = ScenarioSummary.fromGame();
      if (!summary) throw new CommandError('No scenario finish in progress');
      const weeksBefore = rt.game.party.weeks;
      if (restart) {
        rt.gm.stateManager.before('finishScenario.restart', ...rt.gm.scenarioManager.scenarioUndoArgs());
        summary.restart();
      } else {
        rt.gm.stateManager.before(
          summary.success && linked ? 'finishScenario.linked' : 'finishScenario.' + (summary.success ? 'success' : 'failure'),
          ...rt.gm.scenarioManager.scenarioUndoArgs(),
          linked ?? ''
        );
        summary.finish(linked);
      }
      rt.gm.stateManager.after();
      // Weeks passed: calendar sections without GHS data become reading reminders.
      for (let week = weeksBefore + 1; week <= rt.game.party.weeks; week++) {
        const sections = [...(rt.gm.campaignManager.campaignData().weeks?.[week] ?? []), ...(rt.game.party.weekSections[week] ?? [])];
        sections.forEach((section) => {
          if (!rt.gm.sectionData(rt.game.edition).some((s) => s.index === section && s.conclusion)) {
            const pending = (rt.ext.pendingConclusions ??= []);
            if (!pending.some((p) => p.section === section)) {
              pending.push({ kind: 'read', section, edition: rt.game.edition ?? 'fh', reason: `calendar week ${week}` });
              rt.log(`Read section ${section} (calendar week ${week})`);
            }
          }
        });
      }
    }
  })
];

function nextFreeStandee(rt: Runtime, monster: Monster, max: number): number | undefined {
  for (let n = 1; n <= max; n++) {
    if (!rt.gm.monsterManager.monsterStandeeUsed(monster, n)) return n;
  }
  return undefined;
}

export const playCommands = commands;
export { characterKey };
