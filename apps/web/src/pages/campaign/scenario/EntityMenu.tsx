import type { EntityRef } from '@fh/engine';
import { Character, gameManager, labelText } from '@fh/ghs-core';
import { ConditionType } from '@fh/ghs-core/vendor/game/model/data/Condition';
import { MonsterType } from '@fh/ghs-core/vendor/game/model/data/MonsterType';
import { MonsterEntity } from '@fh/ghs-core/vendor/game/model/MonsterEntity';
import { Modal } from '../../../components/ui';
import { useCampaign } from '../../../lib/campaign-store';
import { displayName, maxHealth, resolveRef } from './helpers';

/** Edit one or more entities: like GHS' entities menu, but each click is applied immediately. */
export function EntityMenu({ refs, onClose }: { refs: EntityRef[]; onClose(): void }) {
  const { send } = useCampaign();
  const run = (type: string, payload: object) => send(type, { targets: refs, ...payload }).catch(() => {});
  const live = refs.map(resolveRef).filter((x): x is NonNullable<typeof x> => !!x);
  const single = live.length === 1 && refs.length === 1 ? live[0]! : undefined;
  const current = single;
  if (!live.length) {
    return null;
  }

  const conditions = gameManager.conditions(gameManager.game.edition).filter((c) => !c.types.includes(ConditionType.hidden));
  const negative = conditions.filter((c) => c.types.includes(ConditionType.negative));
  const positive = conditions.filter((c) => c.types.includes(ConditionType.positive));
  const has = (name: string) => live.every(({ entity }) => entity.entityConditions.some((c) => c.name === name && !c.expired));
  const title = single
    ? `${displayName(single.figure)}${single.entity instanceof MonsterEntity ? ` #${single.entity.number}${single.entity.type === MonsterType.elite ? ' (elite)' : ''}` : ''}`
    : `${refs.length} selected`;
  const character = current?.entity instanceof Character ? current.entity : undefined;

  return (
    <Modal title={title} onClose={onClose}>
      {current && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-frost-400">Hit points</span>
          <span className="font-mono text-2xl">
            {current.entity.health}
            <span className="text-base text-frost-400"> / {maxHealth(current.entity)}</span>
          </span>
        </div>
      )}
      <div className="mb-4 grid grid-cols-6 gap-1.5">
        {[-5, -3, -1, 1, 3, 5].map((delta) => (
          <button key={delta} className={`btn ${delta < 0 ? 'text-blood-400' : 'text-moss-400'}`} onClick={() => run('entity.changeHealth', { delta })}>
            {delta > 0 ? '+' : ''}
            {delta}
          </button>
        ))}
      </div>

      {character && (
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <Counter label="Scenario XP" value={character.experience} onChange={(delta) => send('character.changeScenarioXP', { edition: character.edition, name: character.name, delta }).catch(() => {})} />
          <Counter label="Coins" value={character.loot} onChange={(delta) => send('character.changeScenarioLoot', { edition: character.edition, name: character.name, delta }).catch(() => {})} />
        </div>
      )}

      {character && (character.identities?.length > 1 || character.tokens?.length > 0) && (
        <div className="mb-4 grid gap-2 text-sm">
          {character.identities?.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-frost-300">Form</span>
              {character.identities.map((identity, index) => (
                <button
                  key={identity}
                  className={`btn text-xs ${character.identity === index ? 'border-ice-400 text-ice-300' : ''}`}
                  onClick={() => send('character.setIdentity', { edition: character.edition, name: character.name, identity: index }).catch(() => {})}
                >
                  {labelText(`data.character.${character.edition}.${character.name}.${identity}`) || identity}
                </button>
              ))}
            </div>
          )}
          {character.tokens?.map((token, index) => (
            <Counter
              key={token}
              label={labelText(`data.character.${character.edition}.${character.name}.tokens.${token}`) || token}
              value={character.tokenValues[index] ?? 0}
              onChange={(delta) =>
                send('character.setToken', { edition: character.edition, name: character.name, index, value: Math.max(0, (character.tokenValues[index] ?? 0) + delta) }).catch(() => {})
              }
            />
          ))}
        </div>
      )}

      <div className="label">Negative conditions</div>
      <ConditionChips names={negative.map((c) => c.name)} has={has} onToggle={(name, on) => run(on ? 'entity.addCondition' : 'entity.removeCondition', { condition: name })} tone="blood" />
      <div className="label mt-3">Positive conditions</div>
      <ConditionChips names={positive.map((c) => c.name)} has={has} onToggle={(name, on) => run(on ? 'entity.addCondition' : 'entity.removeCondition', { condition: name })} tone="moss" />

      {current && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Counter
            label="Shield (round)"
            value={Number(current.entity.shield?.value ?? 0)}
            onChange={(delta) => run('entity.setShield', { value: Math.max(0, Number(current.entity.shield?.value ?? 0) + delta) })}
          />
          <Counter
            label="Retaliate (round)"
            value={Number(current.entity.retaliate?.[0]?.value ?? 0)}
            onChange={(delta) => run('entity.setRetaliate', { value: Math.max(0, Number(current.entity.retaliate?.[0]?.value ?? 0) + delta) })}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-between gap-2">
        <div className="flex gap-2">
          {single?.entity instanceof MonsterEntity && single.entity.type !== MonsterType.boss && (
            <button className="btn" onClick={() => send('monster.toggleType', { standee: refs[0] }).catch(() => {})}>
              Make {single.entity.type === MonsterType.normal ? 'elite' : 'normal'}
            </button>
          )}
          <button className="btn" onClick={() => run('entity.changeMaxHealth', { delta: 1 })}>
            Max HP +1
          </button>
          <button className="btn" onClick={() => run('entity.changeMaxHealth', { delta: -1 })}>
            Max HP −1
          </button>
        </div>
        {character && (
          <button className="btn" onClick={() => send('character.toggleAbsent', { edition: character.edition, name: character.name }).catch(() => {})}>
            {character.absent ? 'Present' : 'Absent'}
          </button>
        )}
        <button
          className="btn btn-danger"
          onClick={() => {
            run('entity.kill', {});
            if (!character) onClose();
          }}
        >
          {character ? (character.exhausted ? 'Not exhausted' : 'Exhausted') : 'Dead'}
        </button>
      </div>
    </Modal>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange(delta: number): void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-ink-600 px-3 py-1.5">
      <span className="text-frost-300">{label}</span>
      <span className="flex items-center gap-2">
        <button className="btn h-7 w-7 p-0" onClick={() => onChange(-1)}>
          −
        </button>
        <span className="w-6 text-center font-mono">{value}</span>
        <button className="btn h-7 w-7 p-0" onClick={() => onChange(1)}>
          +
        </button>
      </span>
    </div>
  );
}

function ConditionChips({ names, has, onToggle, tone }: { names: string[]; has(name: string): boolean; onToggle(name: string, on: boolean): void; tone: 'blood' | 'moss' }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => {
        const on = has(name);
        return (
          <button
            key={name}
            onClick={() => onToggle(name, !on)}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
              on ? (tone === 'blood' ? 'border-blood-400 bg-blood-400/20 text-blood-400' : 'border-moss-400 bg-moss-400/20 text-moss-400') : 'border-ink-600 text-frost-400 hover:text-frost-100'
            }`}
          >
            {labelText('game.condition.' + name)}
          </button>
        );
      })}
    </div>
  );
}
