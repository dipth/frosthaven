import { characterKey } from '@fh/engine';
import { Character, gameManager, Monster } from '@fh/ghs-core';
import { useMemo, useState } from 'react';
import { useCampaign } from '../../lib/campaign-store';
import { characterName, monsterName } from '../../lib/labels';

export function ScenarioTab() {
  const { state, send } = useCampaign();
  const ghs = state!.ghs;
  const [scenarioIndex, setScenarioIndex] = useState('');

  const scenarios = useMemo(() => gameManager.scenarioManager.scenarioData('fh', true).filter((s) => !s.group), []);

  if (!ghs.scenario) {
    return (
      <section className="panel grid max-w-xl gap-3 p-4">
        <h2 className="font-medium">Start a scenario</h2>
        <select className="input" value={scenarioIndex} onChange={(e) => setScenarioIndex(e.target.value)}>
          <option value="">Choose…</option>
          {scenarios.map((s) => (
            <option key={s.index} value={s.index}>
              #{s.index} {s.name}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" disabled={!scenarioIndex} onClick={() => send('scenario.set', { index: scenarioIndex }).catch(() => {})}>
          Set up scenario
        </button>
      </section>
    );
  }

  const scenarioData = scenarios.find((s) => s.index === ghs.scenario!.index);
  // Keep rows stable while initiatives are being chosen; show turn order once drawn.
  const figures =
    ghs.state === 'draw'
      ? [...gameManager.game.figures].sort((a, b) => Number(b instanceof Character) - Number(a instanceof Character) || a.name.localeCompare(b.name))
      : gameManager.game.figures;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium">
          #{ghs.scenario.index} {scenarioData?.name}
        </h2>
        <span className="text-sm text-frost-400">
          Round {ghs.round} · level {ghs.level} · {ghs.state === 'draw' ? 'choose initiatives' : 'playing'}
        </span>
        <div className="ml-auto flex gap-2">
          <button className="btn btn-primary" onClick={() => send('round.next', {}).catch(() => {})}>
            {ghs.state === 'draw' ? 'Draw' : 'Next round'}
          </button>
          <button className="btn btn-danger" onClick={() => confirm('Reset the scenario?') && send('scenario.reset', {}).catch(() => {})}>
            Reset
          </button>
        </div>
      </div>
      <ol className="grid gap-2">
        {figures.map((figure) => {
          const character = ghs.characters.find((c) => c.name === figure.name && c.edition === figure.edition && figure.type === 'character');
          if (character) {
            return (
              <li key={characterKey(character)} className="panel flex items-center gap-3 px-3 py-2">
                <InitiativeInput
                  value={character.initiative}
                  disabled={ghs.state !== 'draw'}
                  onChange={(initiative) => send('character.initiative', { edition: character.edition, name: character.name, initiative }).catch(() => {})}
                />
                <span className="font-medium">{characterName(character)}</span>
                <span className="text-sm text-frost-400">
                  HP {character.health}/{figure instanceof Character ? figure.maxHealth : '?'}
                </span>
              </li>
            );
          }
          const monster = ghs.monsters.find((m) => m.name === figure.name && m.edition === figure.edition);
          if (monster) {
            const ability = figure instanceof Monster ? gameManager.monsterManager.getAbilityCard(figure) : undefined;
            return (
              <li key={`m-${monster.name}`} className="panel flex items-center gap-3 px-3 py-2">
                <span className="w-10 text-center font-mono text-lg text-ember-400">{ability?.initiative ?? '–'}</span>
                <span className="font-medium">{monsterName(monster)}</span>
                <span className="text-sm text-frost-400">
                  {monster.entities.filter((e) => !e.dead).length} standees{ability ? ` · ${ability.name ?? ''}` : ''}
                </span>
              </li>
            );
          }
          return null;
        })}
      </ol>
    </div>
  );
}

function InitiativeInput({ value, disabled, onChange }: { value: number; disabled: boolean; onChange(value: number): void }) {
  const [draft, setDraft] = useState<string>();
  return (
    <input
      className="input w-14 text-center font-mono text-lg"
      inputMode="numeric"
      disabled={disabled}
      value={draft ?? (value ? String(value).padStart(2, '0') : '')}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
      onBlur={() => {
        if (draft !== undefined && draft !== '') {
          onChange(Number(draft));
        }
        setDraft(undefined);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
