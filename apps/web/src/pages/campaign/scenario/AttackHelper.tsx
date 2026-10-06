/**
 * Attack helper: draws the attacker's modifier card(s), works out the result
 * against the target's shield (GHS AttackModifierManager.calculateAttackResult)
 * and applies damage and conditions. Card text stays with the players: they
 * enter the attack value and pierce from the card.
 */
import type { EntityRef } from '@fh/engine';
import { Character, gameManager, labelText, Monster } from '@fh/ghs-core';
import { ActionType } from '@fh/ghs-core/vendor/game/model/data/Action';
import type { AttackModifierDeck } from '@fh/ghs-core/vendor/game/model/data/AttackModifier';
import { EntityValueFunction, type Entity } from '@fh/ghs-core/vendor/game/model/Entity';
import type { Figure } from '@fh/ghs-core/vendor/game/model/Figure';
import { MonsterEntity } from '@fh/ghs-core/vendor/game/model/MonsterEntity';
import { Summon } from '@fh/ghs-core/vendor/game/model/Summon';
import { useState } from 'react';
import { Panel } from '../../../components/ui';
import { useCampaign } from '../../../lib/campaign-store';
import { amText, entityRef } from './helpers';

interface Combatant {
  key: string;
  label: string;
  figure: Figure;
  entity: Entity;
  ref: EntityRef;
}

function combatants(): Combatant[] {
  const out: Combatant[] = [];
  for (const figure of gameManager.game.figures) {
    if (figure instanceof Character && !figure.absent) {
      out.push({ key: `c-${figure.name}`, label: gameManager.characterManager.characterName(figure), figure, entity: figure, ref: entityRef(figure, figure) });
      for (const s of figure.summons.filter((s) => !s.dead && s.health > 0)) {
        out.push({ key: `s-${s.uuid}`, label: `${s.title || s.name.replace(/-/g, ' ')}${s.number ? ` ${s.number}` : ''}`, figure, entity: s, ref: entityRef(figure, s) });
      }
    } else if (figure instanceof Monster) {
      for (const e of figure.entities.filter((e) => !e.dead && e.health > 0)) {
        out.push({
          key: `m-${figure.name}-${e.number}`,
          label: `${labelText('data.monster.' + figure.name)} ${e.number > 0 ? e.number : ''}${e.type === 'elite' ? ' (elite)' : e.type === 'boss' ? ' (boss)' : ''}`,
          figure,
          entity: e,
          ref: entityRef(figure, e)
        });
      }
    }
  }
  return out;
}

function deckFor(c: Combatant): { ref: 'monster' | 'ally' | { kind: 'character'; edition: string; name: string }; deck: AttackModifierDeck } {
  if (c.figure instanceof Character) {
    return { ref: { kind: 'character', edition: c.figure.edition, name: c.figure.name }, deck: c.figure.attackModifierDeck };
  }
  const monster = c.figure as Monster;
  return monster.isAlly || monster.isAllied
    ? { ref: 'ally', deck: gameManager.game.allyAttackModifierDeck }
    : { ref: 'monster', deck: gameManager.game.monsterAttackModifierDeck };
}

function sumActions(actions: { type: string; value: unknown }[] | undefined, type: ActionType, level: number) {
  return (actions ?? []).filter((a) => a.type === type).reduce((n, a) => n + EntityValueFunction(a.value as string | number, level), 0);
}

/** Printed attack value of a monster standee or summon (characters use their card). */
function baseAttack(c: Combatant): number | undefined {
  if (c.entity instanceof MonsterEntity) {
    const stat = gameManager.monsterManager.getStat(c.figure as Monster, c.entity.type);
    return EntityValueFunction(stat.attack, (c.figure as Monster).level);
  }
  if (c.entity instanceof Summon) return EntityValueFunction(c.entity.attack);
  return undefined;
}

function shieldOf(c: Combatant): number {
  let shield = c.entity.shield ? EntityValueFunction(c.entity.shield.value as string | number) : 0;
  if (c.entity instanceof MonsterEntity) {
    const monster = c.figure as Monster;
    shield += sumActions(gameManager.monsterManager.getStat(monster, c.entity.type).actions, ActionType.shield, monster.level);
  }
  return shield;
}

function retaliateOf(c: Combatant): number {
  let retaliate = (c.entity.retaliate ?? []).reduce((n, a) => n + EntityValueFunction(a.value as string | number), 0);
  if (c.entity instanceof MonsterEntity) {
    const monster = c.figure as Monster;
    retaliate += sumActions(gameManager.monsterManager.getStat(monster, c.entity.type).actions, ActionType.retaliate, monster.level);
  }
  return retaliate;
}

export function AttackHelper() {
  const { send } = useCampaign();
  const all = combatants();
  const [attackerKey, setAttackerKey] = useState('');
  const [targetKey, setTargetKey] = useState('');
  const [attack, setAttack] = useState('');
  const [pierce, setPierce] = useState(0);
  const [factor, setFactor] = useState<'' | 'advantage' | 'disadvantage'>('');
  const [drawn, setDrawn] = useState<{ deckKey: string; before: number }>();
  const attacker = all.find((c) => c.key === attackerKey);
  const target = all.find((c) => c.key === targetKey);

  const pickAttacker = (key: string) => {
    setAttackerKey(key);
    setDrawn(undefined);
    const c = all.find((x) => x.key === key);
    const base = c && baseAttack(c);
    setAttack(base !== undefined ? String(base) : '');
  };

  const deck = attacker ? deckFor(attacker) : undefined;
  const deckKey = deck ? (typeof deck.ref === 'string' ? deck.ref : deck.ref.name) : '';
  const result =
    drawn && deck && drawn.deckKey === deckKey && deck.deck.current !== drawn.before && deck.deck.current >= 0
      ? gameManager.attackModifierManager.calculateAttackResult(deck.deck, Number(attack) || 0)
      : undefined;
  const shield = target ? shieldOf(target) : 0;
  const damage = result ? Math.max(0, result.result - Math.max(0, shield - pierce)) : 0;
  const conditions = (result?.effects ?? []).filter((e) => e.type === 'condition').map((e) => e.value);
  const card = result ? deck!.deck.cards[result.index] : undefined;

  const draw = () => {
    if (!deck) return;
    setDrawn({ deckKey, before: deck.deck.current });
    send('am.draw', { deck: deck.ref, ...(factor ? { state: factor } : {}) }).catch(() => setDrawn(undefined));
  };

  const apply = () => {
    if (!target) return;
    const steps: Promise<unknown>[] = [];
    if (damage) steps.push(send('entity.changeHealth', { targets: [target.ref], delta: -damage }));
    for (const condition of conditions) steps.push(send('entity.addCondition', { targets: [target.ref], condition }));
    Promise.all(steps)
      .then(() => setDrawn(undefined))
      .catch(() => {});
  };

  return (
    <Panel title="Attack helper">
      <div className="grid gap-2 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={attackerKey} onChange={(e) => pickAttacker(e.target.value)}>
            <option value="">Attacker…</option>
            {all.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select className="input" value={targetKey} onChange={(e) => setTargetKey(e.target.value)}>
            <option value="">Target…</option>
            {all
              .filter((c) => c.key !== attackerKey)
              .map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            Attack
            <input className="input w-14 py-0.5" inputMode="numeric" value={attack} onChange={(e) => setAttack(e.target.value)} />
          </label>
          <label className="flex items-center gap-1">
            Pierce
            <input className="input w-12 py-0.5" inputMode="numeric" value={pierce} onChange={(e) => setPierce(Number(e.target.value) || 0)} />
          </label>
          <select className="input w-auto py-0.5" value={factor} onChange={(e) => setFactor(e.target.value as typeof factor)}>
            <option value="">Normal</option>
            <option value="advantage">Advantage</option>
            <option value="disadvantage">Disadvantage</option>
          </select>
        </div>
        {target && (
          <div className="text-xs text-frost-400">
            Target: {target.entity.health} HP · shield {shield}
            {retaliateOf(target) ? ` · retaliate ${retaliateOf(target)}` : ''}
          </div>
        )}
        <button className="btn btn-primary" disabled={!attacker || attack === ''} onClick={draw}>
          Draw modifier
        </button>
        {result && (
          <div className="rounded-lg border border-ink-600 p-2">
            <div>
              Drew <b>{amText(card)}</b>: {result.stringified} = <b>{result.result}</b>
            </div>
            {target && (
              <div>
                {damage} damage to {target.label}
                {conditions.length ? ` + ${conditions.map((c) => labelText('game.condition.' + c)).join(', ')}` : ''}
              </div>
            )}
            {target && (
              <button className="btn mt-2 w-full" onClick={apply}>
                Apply to {target.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
