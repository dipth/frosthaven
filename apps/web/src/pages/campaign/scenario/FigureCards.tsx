import { actionLines, characterKey, statLines, type EntityRef } from '@fh/engine';
import { Character, gameManager, GameState, labelText, Monster } from '@fh/ghs-core';
import { MonsterType } from '@fh/ghs-core/vendor/game/model/data/MonsterType';
import { EntityValueFunction, type Entity } from '@fh/ghs-core/vendor/game/model/Entity';
import type { Figure } from '@fh/ghs-core/vendor/game/model/Figure';
import { ObjectiveContainer } from '@fh/ghs-core/vendor/game/model/ObjectiveContainer';
import { useState, type ReactNode } from 'react';
import { Modal } from '../../../components/ui';
import { useCampaign } from '../../../lib/campaign-store';
import { useMe } from '../../../lib/me';
import { AmDeck } from './Decks';
import { amText, displayName, entityRef, figureRef, maxHealth } from './helpers';

export function FigureCard({ figure, onMenu }: { figure: Figure; onMenu(refs: EntityRef[]): void }) {
  if (figure instanceof Character) return <CharacterCard character={figure} onMenu={onMenu} />;
  if (figure instanceof Monster) return <MonsterCard monster={figure} onMenu={onMenu} />;
  if (figure instanceof ObjectiveContainer) return <ObjectiveCard objective={figure} onMenu={onMenu} />;
  return null;
}

function Frame({ figure, children, initiative, tone }: { figure: Figure; children: ReactNode; initiative: ReactNode; tone?: string }) {
  const { send } = useCampaign();
  const state = gameManager.game.state;
  const active = figure.active;
  const done = figure.off;
  return (
    <section
      className={`panel flex gap-3 p-3 transition ${active ? 'border-ice-400 ring-2 ring-ice-400/40' : ''} ${done && state === GameState.next ? 'opacity-55' : ''} ${tone ?? ''}`}
    >
      {state === GameState.next ? (
        <button
          className="flex w-14 shrink-0 flex-col items-center justify-start gap-1 rounded-lg pt-1 hover:bg-ink-700"
          title={active ? 'End turn' : 'Start turn'}
          onClick={() => send('figure.toggleTurn', { figure: figureRef(figure) }).catch(() => {})}
        >
          {initiative}
          <span className="text-[10px] uppercase tracking-wide text-frost-400">{active ? 'acting' : done ? 'done' : 'turn'}</span>
        </button>
      ) : (
        <div className="flex w-14 shrink-0 flex-col items-center pt-1">{initiative}</div>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function HealthBar({ entity }: { entity: Entity }) {
  const max = maxHealth(entity);
  const pct = max ? Math.max(0, Math.min(100, (entity.health / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-950">
      <div className={`h-full ${pct > 50 ? 'bg-moss-400' : pct > 25 ? 'bg-ember-400' : 'bg-blood-400'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Conditions({ entity }: { entity: Entity }) {
  const active = entity.entityConditions.filter((c) => !c.expired && !c.types?.includes('hidden' as never));
  if (!active.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {active.map((c) => (
        <span key={c.name} className={`rounded px-1.5 text-[11px] ${c.types?.includes('negative' as never) ? 'bg-blood-400/20 text-blood-400' : 'bg-moss-400/20 text-moss-400'}`}>
          {labelText('game.condition.' + c.name)}
          {c.value > 1 ? ` ${c.value}` : ''}
        </span>
      ))}
    </span>
  );
}

function CharacterCard({ character, onMenu }: { character: Character; onMenu(refs: EntityRef[]): void }) {
  const { state, send } = useCampaign();
  const me = useMe();
  const owner = state!.ext.characterOwners[characterKey(character)];
  const mine = !owner || owner === me.id || me.role === 'admin';
  const drawPhase = gameManager.game.state === GameState.draw;
  const ref = entityRef(character, character);
  const [showDeck, setShowDeck] = useState(false);

  return (
    <Frame
      figure={character}
      initiative={
        drawPhase ? (
          <InitiativeInput character={character} disabled={!mine} />
        ) : (
          <span className="font-mono text-2xl">{character.longRest ? 'LR' : String(character.initiative).padStart(2, '0')}</span>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button className="font-medium hover:text-ice-300" onClick={() => onMenu([ref])}>
          {character.title || displayName(character)}
        </button>
        <span className="text-xs text-frost-400">
          L{character.level}
          {character.exhausted && <span className="ml-2 text-blood-400">exhausted</span>}
          {character.absent && <span className="ml-2">absent</span>}
        </span>
        <Conditions entity={character} />
        <span className="ml-auto flex items-center gap-2 text-sm">
          <QuickHealth ref_={ref} />
          <span className="font-mono">
            {character.health}/{maxHealth(character)}
          </span>
        </span>
      </div>
      <div className="mt-1.5">
        <HealthBar entity={character} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-frost-400">
        <span>XP {character.experience}</span>
        <span>Loot {character.lootCards.length ? `${character.lootCards.length} card${character.lootCards.length > 1 ? 's' : ''}` : character.loot}</span>
        {drawPhase && (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={character.longRest}
              disabled={!mine}
              onChange={(e) => send('character.longRest', { edition: character.edition, name: character.name, on: e.target.checked }).catch(() => {})}
            />
            long rest
          </label>
        )}
        <button className="hover:text-frost-100" onClick={() => setShowDeck((v) => !v)}>
          modifiers: {amText(character.attackModifierDeck.cards[character.attackModifierDeck.current]) || '—'} {showDeck ? '▴' : '▾'}
        </button>
      </div>
      {showDeck && (
        <div className="mt-2">
          <AmDeck deck={{ kind: 'character', edition: character.edition, name: character.name }} attackModifierDeck={character.attackModifierDeck} />
        </div>
      )}
      {character.summons.filter((s) => !s.dead).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {character.summons
            .filter((s) => !s.dead)
            .map((summon) => (
              <button
                key={summon.uuid}
                onClick={() => onMenu([entityRef(character, summon)])}
                className="flex min-w-28 flex-col gap-1 rounded-md border border-ink-600 bg-ink-850 px-2 py-1 text-left text-xs hover:border-ice-500"
              >
                <span className="flex justify-between gap-2">
                  <span>{labelText('data.summon.' + summon.name) || summon.name}</span>
                  <span className="font-mono">
                    {summon.health}/{maxHealth(summon)}
                  </span>
                </span>
                <HealthBar entity={summon} />
                <Conditions entity={summon} />
              </button>
            ))}
        </div>
      )}
    </Frame>
  );
}

function QuickHealth({ ref_ }: { ref_: EntityRef }) {
  const { send } = useCampaign();
  return (
    <span className="flex gap-1">
      <button className="btn h-6 w-6 p-0 text-blood-400" onClick={() => send('entity.changeHealth', { targets: [ref_], delta: -1 }).catch(() => {})}>
        −
      </button>
      <button className="btn h-6 w-6 p-0 text-moss-400" onClick={() => send('entity.changeHealth', { targets: [ref_], delta: 1 }).catch(() => {})}>
        +
      </button>
    </span>
  );
}

function InitiativeInput({ character, disabled }: { character: Character; disabled: boolean }) {
  const { send } = useCampaign();
  const [draft, setDraft] = useState<string>();
  const value = character.initiative ? String(character.initiative).padStart(2, '0') : '';
  return (
    <input
      className="input w-12 px-1 text-center font-mono text-xl"
      inputMode="numeric"
      placeholder="--"
      disabled={disabled}
      value={draft ?? value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
      onBlur={() => {
        if (draft) {
          send('character.initiative', { edition: character.edition, name: character.name, initiative: Number(draft) }).catch(() => {});
        }
        setDraft(undefined);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function MonsterCard({ monster, onMenu }: { monster: Monster; onMenu(refs: EntityRef[]): void }) {
  const { send } = useCampaign();
  const [picking, setPicking] = useState<number>();
  const ability = gameManager.monsterManager.getAbilityCard(monster);
  const drawn = gameManager.game.state === GameState.next && ability;
  const entities = [...monster.entities].filter((e) => !e.dead).sort(gameManager.monsterManager.sortEntities);
  const normal = gameManager.monsterManager.getStat(monster, monster.boss ? MonsterType.boss : MonsterType.normal);
  const elite = monster.boss ? undefined : gameManager.monsterManager.getStat(monster, MonsterType.elite);
  const lines = drawn ? actionLines(ability.actions ?? [], monster) : [];
  const max = gameManager.monsterManager.monsterStandeeMax(monster);
  const statText = (stat: typeof normal) =>
    `HP ${EntityValueFunction(stat.health, monster.level)} · Move ${EntityValueFunction(stat.movement, monster.level)} · Attack ${typeof stat.attack === 'number' ? stat.attack : stat.attack} ${stat.range ? `· Range ${stat.range}` : ''}`;

  return (
    <Frame
      figure={monster}
      tone={monster.isAlly ? 'border-moss-400/40' : undefined}
      initiative={<span className="font-mono text-2xl text-ember-400">{drawn ? String(ability.initiative).padStart(2, '0') : '–'}</span>}
    >
      <div className="flex flex-wrap items-center gap-x-3">
        <span className="font-medium">{displayName(monster)}</span>
        <span className="text-xs text-frost-400">
          level {monster.level}
          {monster.isAlly && ' · ally'}
        </span>
        {drawn && <span className="text-sm text-frost-300">{ability.name}{ability.shuffle ? ' ↻' : ''}</span>}
        <span className="ml-auto flex gap-1">
          {!monster.boss && (
            <button className="btn h-7 px-2 text-xs" onClick={() => send('monster.addStandee', { edition: monster.edition, name: monster.name, type: 'normal' }).catch(() => {})}>
              + normal
            </button>
          )}
          <button
            className="btn h-7 px-2 text-xs text-ember-400"
            onClick={() => send('monster.addStandee', { edition: monster.edition, name: monster.name, type: monster.boss ? 'boss' : 'elite' }).catch(() => {})}
          >
            + {monster.boss ? 'boss' : 'elite'}
          </button>
        </span>
      </div>
      <div className="mt-1 grid gap-0.5 text-xs text-frost-400">
        <span>
          {monster.boss ? 'Boss' : 'Normal'}: {statText(normal)}
          {statLines(monster, monster.boss ? MonsterType.boss : MonsterType.normal).length > 0 && ` · ${statLines(monster, monster.boss ? MonsterType.boss : MonsterType.normal).join(', ')}`}
        </span>
        {elite && (
          <span className="text-ember-400/80">
            Elite: {statText(elite)}
            {statLines(monster, MonsterType.elite).length > 0 && ` · ${statLines(monster, MonsterType.elite).join(', ')}`}
          </span>
        )}
      </div>
      {lines.length > 0 && (
        <ul className="mt-2 rounded-lg border border-ink-600 bg-ink-950/50 px-3 py-2 text-sm">
          {lines.map((line, i) => (
            <li key={i} style={{ paddingLeft: `${line.depth * 14}px` }} className={line.depth ? 'text-frost-300' : ''}>
              {line.values ? (
                <>
                  {line.text.replace(/ [^ ]+ \/ [^ ]+$/, '')} <span>{line.values.normal}</span>
                  <span className="text-frost-400"> / </span>
                  <span className="text-ember-400">{line.values.elite}</span>
                </>
              ) : (
                line.text
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entities.map((entity) => (
          <button
            key={`${entity.type}-${entity.number}`}
            onClick={() => (entity.number < 0 ? setPicking(entity.number) : onMenu([entityRef(monster, entity)]))}
            className={`flex w-24 flex-col gap-1 rounded-md border px-2 py-1 text-left text-xs hover:border-ice-500 ${
              entity.type === MonsterType.elite ? 'border-ember-400/70 bg-ember-400/10' : entity.type === MonsterType.boss ? 'border-blood-400/70 bg-blood-400/10' : 'border-ink-500 bg-ink-850'
            } ${entity.active ? 'ring-2 ring-ice-400/60' : ''}`}
          >
            <span className="flex justify-between">
              <span className={`font-mono font-semibold ${entity.number < 0 ? 'text-ember-400' : ''}`}>{entity.number < 0 ? '#?' : `#${entity.number}`}</span>
              <span className="font-mono">
                {entity.health}/{maxHealth(entity)}
              </span>
            </span>
            <HealthBar entity={entity} />
            <Conditions entity={entity} />
          </button>
        ))}
        {entities.length === 0 && <span className="text-xs text-frost-400">No standees on the map ({max} available).</span>}
        {entities.length > 1 && (
          <button className="rounded-md border border-dashed border-ink-500 px-2 text-xs text-frost-400 hover:text-frost-100" onClick={() => onMenu(entities.map((e) => entityRef(monster, e)))}>
            all…
          </button>
        )}
      </div>
      {entities.some((e) => e.number < 0) && <p className="mt-1 text-xs text-ember-400">Tap a #? standee to enter the number of the standee you placed.</p>}
      {picking !== undefined && <StandeePicker monster={monster} entityNumber={picking} onClose={() => setPicking(undefined)} />}
    </Frame>
  );
}

function ObjectiveCard({ objective, onMenu }: { objective: ObjectiveContainer; onMenu(refs: EntityRef[]): void }) {
  const entities = objective.entities.filter((e) => !e.dead);
  return (
    <Frame figure={objective} initiative={<span className="font-mono text-2xl">{objective.getInitiative() || '–'}</span>}>
      <div className="font-medium">{displayName(objective)}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entities.map((entity) => (
          <button
            key={entity.number}
            onClick={() => onMenu([entityRef(objective, entity)])}
            className="flex w-24 flex-col gap-1 rounded-md border border-ink-500 bg-ink-850 px-2 py-1 text-left text-xs hover:border-ice-500"
          >
            <span className="flex justify-between">
              <span>#{entity.number}</span>
              <span className="font-mono">
                {entity.health}/{maxHealth(entity)}
              </span>
            </span>
            <HealthBar entity={entity} />
            <Conditions entity={entity} />
          </button>
        ))}
      </div>
    </Frame>
  );
}

function StandeePicker({ monster, entityNumber, onClose }: { monster: Monster; entityNumber: number; onClose(): void }) {
  const { send } = useCampaign();
  const max = gameManager.monsterManager.monsterStandeeMax(monster);
  const used = new Set(monster.entities.filter((e) => !e.dead && e.number > 0).map((e) => e.number));
  const free = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !used.has(n));
  const entity = monster.entities.find((e) => e.number === entityNumber);
  const pick = (number: number) => {
    send('monster.changeStandeeNumber', { standee: { kind: 'monster', edition: monster.edition, name: monster.name, number: entityNumber }, number })
      .then(onClose)
      .catch(() => {});
  };
  return (
    <Modal title={`${displayName(monster)} standee number`} onClose={onClose}>
      <p className="mb-3 text-sm text-frost-400">{entity?.type === MonsterType.elite ? 'Elite' : entity?.type === MonsterType.boss ? 'Boss' : 'Normal'} standee: which number did you place?</p>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button key={n} className="btn h-11 font-mono text-lg" disabled={used.has(n)} onClick={() => pick(n)}>
            {n}
          </button>
        ))}
      </div>
      <button className="btn mt-3 w-full" disabled={!free.length} onClick={() => pick(free[Math.floor(Math.random() * free.length)]!)}>
        Random
      </button>
    </Modal>
  );
}
