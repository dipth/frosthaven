/**
 * Shared outpost attack, after GHS
 * src/app/ui/figures/entities-menu/outpost-attack (AGPL-3.0).
 */
import { barracks, currentAttackValue, defenseValue, drawFactor, moraleDefense, outpostBuildings, townGuardDeck, type OutpostAttackState } from '@fh/engine';
import { gameManager, labelText } from '@fh/ghs-core';
import { useCampaign } from '../lib/campaign-store';
import { buildingName } from '../lib/labels';
import { amText } from '../pages/campaign/scenario/helpers';
import { Modal } from './ui';

export function OutpostAttackDialog({ attack }: { attack: OutpostAttackState }) {
  const { send } = useCampaign();
  const run = (command: string, payload: object = {}) => send(command, payload).catch(() => {});
  const party = gameManager.game.party;
  const buildings = outpostBuildings();
  const b = barracks();
  const factor = drawFactor(attack.soldiers);
  const attackValue = currentAttackValue(attack);
  const remaining = Math.min(attack.targetNumber, attack.order.length) - attack.attacks;
  const current = remaining > 0 ? attack.order[attack.attacks] : undefined;
  const deck = townGuardDeck();
  const drawn = attack.result && deck ? deck.cards[attack.result.index] : undefined;
  const other = attack.result?.chooseOffset && deck ? deck.cards[attack.result.index + attack.result.chooseOffset] : undefined;
  const result = attack.result;
  const outcome = !result
    ? undefined
    : result.type === 'wreck'
      ? 'wrecked'
      : result.type !== 'success' && result.value < attackValue
        ? 'damaged'
        : 'defended';
  const notTargeted = buildings.filter((x) => !attack.order.includes(x.model.name));

  const move = (from: number, to: number) => {
    const order = [...attack.order];
    const [name] = order.splice(from, 1);
    order.splice(to, 0, name!);
    run('outpostAttack.reorder', { order });
  };

  return (
    <Modal wide title="Outpost attack" onClose={() => {}}>
      <div className="grid gap-4 text-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Attack" value={attackValue} hint={attack.soldiers ? `${attack.attackValue} ${b?.bonus ?? 0}×${attack.soldiers}` : undefined} />
          <Stat label="Defense" value={defenseValue()} hint={`${party.defense || 0} ${moraleDefense(party.morale) >= 0 ? '+' : ''}${moraleDefense(party.morale)} morale`} />
          <Stat label="Targets left" value={Math.max(remaining, 0)} hint={`of ${attack.targetNumber}`} />
          <Stat label="Soldiers" value={party.soldiers} hint={b ? `barracks ${b.level}${b.wrecked ? ' (wrecked)' : ''}` : 'no barracks'} />
        </div>
        {attack.targetDescription && <p className="text-frost-300">{labelText(attack.targetDescription)}</p>}

        <section>
          <div className="label mb-1">Targets</div>
          <ol className="grid gap-1">
            {attack.order.map((name, i) => {
              const done = attack.log[i];
              const state = buildings.find((x) => x.model.name === name)?.model.state;
              return (
                <li
                  key={name}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${name === current ? 'border-ice-400 bg-ice-500/10' : 'border-ink-700'} ${
                    i >= attack.targetNumber ? 'opacity-50' : ''
                  }`}
                >
                  <span className="w-5 text-xs text-frost-400">{i + 1}.</span>
                  <span>{buildingName(name)}</span>
                  {state !== 'normal' && <span className="text-xs text-ember-400">{state}</span>}
                  {done && <span className="text-xs text-frost-400">→ {done.state === 'normal' ? 'defended' : done.state}</span>}
                  {i >= attack.attacks && (
                    <span className="ml-auto flex gap-1">
                      <button className="btn px-2 py-0.5 text-xs" disabled={i <= attack.attacks} onClick={() => move(i, i - 1)} title="Earlier">
                        ↑
                      </button>
                      <button className="btn px-2 py-0.5 text-xs" disabled={i === attack.order.length - 1} onClick={() => move(i, i + 1)} title="Later">
                        ↓
                      </button>
                      <button
                        className="btn px-2 py-0.5 text-xs"
                        title="Not a target"
                        onClick={() => run('outpostAttack.reorder', { order: attack.order.filter((x) => x !== name) })}
                      >
                        ×
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {notTargeted.length > 0 && (
            <select
              className="input mt-2 w-auto"
              value=""
              onChange={(e) => e.target.value && run('outpostAttack.reorder', { order: [...attack.order, e.target.value] })}
            >
              <option value="">Add a target…</option>
              {notTargeted.map((x) => (
                <option key={x.model.name} value={x.model.name}>
                  {x.data.id} {buildingName(x.model.name)}
                </option>
              ))}
            </select>
          )}
        </section>

        {current && (
          <section className="rounded-xl border border-ink-600 p-3">
            <div className="mb-2 font-medium">Attacking {buildingName(current)}</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-frost-300">Defending soldiers</span>
              <button className="btn px-2 py-0.5" disabled={attack.soldiers === 0} onClick={() => run('outpostAttack.setSoldiers', { soldiers: attack.soldiers - 1 })}>
                −
              </button>
              <span className="w-5 text-center font-mono">{attack.soldiers}</span>
              <button
                className="btn px-2 py-0.5"
                disabled={!b || b.wrecked || attack.soldiers >= party.soldiers}
                onClick={() => run('outpostAttack.setSoldiers', { soldiers: attack.soldiers + 1 })}
              >
                +
              </button>
              {factor && <span className={factor === 'advantage' ? 'text-moss-400' : 'text-blood-400'}>{factor}</span>}
              <button className="btn btn-primary ml-auto" onClick={() => run('outpostAttack.draw')}>
                Draw town guard card
              </button>
            </div>
            {result && (
              <div className="mt-3 grid gap-1">
                <div>
                  Drew <b>{amText(drawn)}</b>
                  {other && (
                    <>
                      {' '}
                      (other card: {amText(other)}{' '}
                      <button className="underline" onClick={() => run('outpostAttack.toggleResult')}>
                        use it
                      </button>
                      )
                    </>
                  )}
                </div>
                <div>
                  Defense {result.stringified} = <b>{result.value}</b> vs attack {attackValue}:{' '}
                  <b className={outcome === 'defended' ? 'text-moss-400' : 'text-blood-400'}>{outcome}</b>
                </div>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={!result} onClick={() => run('outpostAttack.resolve')}>
                Apply result
              </button>
              <span className="text-xs text-frost-400 self-center">or set by hand:</span>
              {(['normal', 'damaged', 'wrecked'] as const).map((state) => (
                <button key={state} className="btn" onClick={() => run('outpostAttack.resolve', { state })}>
                  {state === 'normal' ? 'defended' : state}
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="flex justify-end">
          <button className="btn btn-primary" onClick={() => (remaining <= 0 || confirm('End the attack before all targets are resolved?')) && run('outpostAttack.finish')}>
            Finish attack
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string | undefined }) {
  return (
    <div className="rounded-lg border border-ink-700 px-3 py-2">
      <div className="text-xs text-frost-400">{label}</div>
      <div className="font-mono text-lg">{value}</div>
      {hint && <div className="text-xs text-frost-400">{hint}</div>}
    </div>
  );
}
