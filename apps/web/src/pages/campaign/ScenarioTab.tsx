import type { EntityRef } from '@fh/engine';
import { Character, gameManager, GameState, labelText, Monster } from '@fh/ghs-core';
import { useMemo, useState } from 'react';
import { AddInput, Panel } from '../../components/ui';
import { useCampaign } from '../../lib/campaign-store';
import { AttackHelper } from './scenario/AttackHelper';
import { Board } from './scenario/Board';
import { AmDeck, ElementBoard, LootDeck } from './scenario/Decks';
import { EntityMenu } from './scenario/EntityMenu';
import { FigureCard } from './scenario/FigureCards';
import { FinishDialog } from './scenario/FinishDialog';
import { Hands } from './scenario/Hand';
import { RulesPanel } from './scenario/RulesPanel';

export function ScenarioTab() {
  const { state, send } = useCampaign();
  const ghs = state!.ghs;
  const [menu, setMenu] = useState<EntityRef[]>();

  if (!ghs.scenario) {
    return <ScenarioSetup />;
  }

  const game = gameManager.game;
  const scenario = game.scenario!;
  const figures = game.figures.filter((f) => gameManager.gameplayFigure(f) || f instanceof Character);
  const hasAllies = figures.some((f) => f instanceof Monster && f.isAlly);
  const drawPhase = game.state === GameState.draw;
  const online = state!.ext.mode === 'online';

  return (
    <div className="grid gap-4">
      <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
        <div>
          <div className="font-medium">
            #{scenario.index} {labelText(gameManager.scenarioManager.scenarioTitle(scenario))}
          </div>
          <div className="text-xs text-frost-400">
            Round {game.round} · {drawPhase ? 'choose initiatives' : 'in progress'} · <LevelControl />
          </div>
        </div>
        <ElementBoard />
        <div className="ml-auto flex flex-wrap gap-2">
          {!drawPhase && (
            <button className="btn" onClick={() => send('figure.next').catch(() => {})}>
              Next turn
            </button>
          )}
          {!(online && drawPhase) && (
            <button className="btn btn-primary" onClick={() => send('round.next').catch(() => {})}>
              {drawPhase ? 'Draw' : 'End round'}
            </button>
          )}
          <button className="btn" onClick={() => send('finish.start', { success: true }).catch(() => {})}>
            Won
          </button>
          <button className="btn" onClick={() => send('finish.start', { success: false }).catch(() => {})}>
            Lost
          </button>
        </div>
      </div>

      <RulesPanel />

      {online && <Board onMenu={setMenu} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-2">
          {online && <Hands />}
          {figures.map((figure) => (
            <FigureCard key={`${figure.type}-${figure.edition}-${figure.name}-${'uuid' in figure ? (figure as { uuid: string }).uuid : ''}`} figure={figure} onMenu={setMenu} />
          ))}
        </div>
        <aside className="grid content-start gap-3">
          <AmDeck deck="monster" attackModifierDeck={game.monsterAttackModifierDeck} title="Monster modifiers" />
          {hasAllies && <AmDeck deck="ally" attackModifierDeck={game.allyAttackModifierDeck} title="Ally modifiers" />}
          <LootDeck />
          <AttackHelper />
          <Tools />
        </aside>
      </div>

      {menu && <EntityMenu refs={menu} onClose={() => setMenu(undefined)} />}
      {ghs.finish && <FinishDialog />}
    </div>
  );
}

function LevelControl() {
  const { send } = useCampaign();
  const level = gameManager.game.level;
  return (
    <span className="inline-flex items-center gap-1">
      level
      <select
        className="bg-transparent text-frost-100"
        value={gameManager.game.levelCalculation ? 'auto' : String(level)}
        onChange={(e) =>
          send('scenario.setLevel', e.target.value === 'auto' ? { automatic: true } : { level: Number(e.target.value) }).catch(() => {})
        }
      >
        <option value="auto">auto ({level})</option>
        {Array.from({ length: 8 }, (_, l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </span>
  );
}

function Tools() {
  const { send } = useCampaign();
  const characters = gameManager.game.figures.filter((f): f is Character => f instanceof Character);
  const monsters = useMemo(
    () =>
      gameManager
        .monstersData('fh')
        .filter((m) => !m.hidden)
        .map((m) => ({ value: m.name, label: labelText('data.monster.' + m.name) })),
    []
  );
  const [summonFor, setSummonFor] = useState('');
  const owner = characters.find((c) => `${c.edition}:${c.name}` === summonFor);
  const summons = owner ? owner.availableSummons.filter((s) => !s.level || s.level <= owner.level) : [];

  return (
    <Panel title="Tools">
      <div className="label">Add monster type</div>
      <AddInput placeholder="Monster…" options={monsters} onAdd={(name) => send('monster.add', { name }).catch(() => {})} />
      <div className="label mt-3">Summon</div>
      <div className="grid gap-2">
        <select className="input" value={summonFor} onChange={(e) => setSummonFor(e.target.value)}>
          <option value="">Character…</option>
          {characters.map((c) => (
            <option key={c.name} value={`${c.edition}:${c.name}`}>
              {gameManager.characterManager.characterName(c)}
            </option>
          ))}
        </select>
        {owner && (
          <div className="flex flex-wrap gap-1.5">
            {summons.map((s) => (
              <button
                key={`${s.name}-${s.cardId}`}
                className="btn text-xs"
                onClick={() => send('summon.add', { edition: owner.edition, name: owner.name, summon: { name: s.name, cardId: s.cardId } }).catch(() => {})}
              >
                {s.name.replace(/-/g, ' ')}
              </button>
            ))}
            <button
              className="btn text-xs"
              onClick={() => {
                const customName = prompt('Summon name');
                if (customName) send('summon.add', { edition: owner.edition, name: owner.name, customName }).catch(() => {});
              }}
            >
              custom…
            </button>
          </div>
        )}
      </div>
      <button className="btn btn-danger mt-4 w-full" onClick={() => confirm('Reset the scenario to its starting state?') && send('scenario.reset').catch(() => {})}>
        Reset scenario
      </button>
    </Panel>
  );
}

function ScenarioSetup() {
  const { state, send } = useCampaign();
  const party = state!.ghs.party;
  const [index, setIndex] = useState('');
  const scenarios = gameManager.scenarioManager.scenarioData('fh', true).filter((s) => !s.group);
  const completed = new Set(party.scenarios.filter((s) => s.edition === 'fh').map((s) => s.index));
  const available = scenarios.filter((s) => !completed.has(s.index) && !gameManager.scenarioManager.isLocked(s) && !gameManager.scenarioManager.isBlocked(s));
  const characters = gameManager.game.figures.filter((f) => f instanceof Character);

  return (
    <Panel title="Start a scenario" className="max-w-xl">
      {characters.length === 0 && <p className="mb-3 text-sm text-ember-400">Add characters on the Characters tab first.</p>}
      <select className="input" value={index} onChange={(e) => setIndex(e.target.value)}>
        <option value="">Choose…</option>
        <optgroup label="Available">
          {available.map((s) => (
            <option key={s.index} value={s.index}>
              #{s.index} {s.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="All scenarios">
          {scenarios.map((s) => (
            <option key={`all-${s.index}`} value={s.index}>
              #{s.index} {s.name}
              {completed.has(s.index) ? ' (completed)' : ''}
            </option>
          ))}
        </optgroup>
      </select>
      <button className="btn btn-primary mt-3" disabled={!index} onClick={() => send('scenario.set', { index }).catch(() => {})}>
        Set up scenario
      </button>
    </Panel>
  );
}
