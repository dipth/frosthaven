/** The Frosthaven outpost phase, step by step, shared by everyone in the campaign. */
import { buildingStep, cardsToPick, carpenterDiscount, OUTPOST_PHASE_STEPS, RULE_DEFAULTS, type OutpostPhase as Phase, type OutpostPhaseStep } from '@fh/engine';
import { Character, gameManager } from '@fh/ghs-core';
import { useState } from 'react';
import { Link } from 'wouter';
import { PaymentDialog } from '../../components/PaymentDialog';
import { Panel } from '../../components/ui';
import { useCampaign } from '../../lib/campaign-store';
import { buildingName, eventDeckName, ghsText, season } from '../../lib/labels';

const STEP_NAMES: Record<OutpostPhaseStep, string> = {
  'passage-of-time': 'Passage of time',
  'outpost-event': 'Outpost event',
  'building-operations': 'Building operations',
  downtime: 'Downtime',
  construction: 'Construction'
};

export function OutpostPhasePanel() {
  const { state, send } = useCampaign();
  const phase = state!.ext.outpostPhase;
  if (!phase) {
    return (
      <Panel title="Outpost phase">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-frost-400">
            After each scenario: passage of time, outpost event, building operations, downtime and construction.
            {state!.ghs.scenario && <span className="text-ember-400"> Finish or reset the current scenario first.</span>}
          </span>
          <button className="btn btn-primary ml-auto" disabled={!!state!.ghs.scenario} onClick={() => send('outpostPhase.start').catch(() => {})}>
            Start outpost phase
          </button>
        </div>
      </Panel>
    );
  }
  const index = OUTPOST_PHASE_STEPS.indexOf(phase.step);
  const go = (step: OutpostPhaseStep) => send('outpostPhase.setStep', { step }).catch(() => {});
  const next = OUTPOST_PHASE_STEPS[index + 1];
  return (
    <Panel title="Outpost phase" className="lg:col-span-2">
      <ol className="mb-4 flex flex-wrap gap-1 text-xs">
        {OUTPOST_PHASE_STEPS.map((step, i) => (
          <li key={step}>
            <button
              className={`rounded-full border px-3 py-1 ${step === phase.step ? 'border-ice-400 bg-ice-500/10 text-frost-100' : i < index ? 'border-moss-400/40 text-moss-400' : 'border-ink-600 text-frost-400'}`}
              onClick={() => go(step)}
            >
              {i + 1}. {STEP_NAMES[step]}
            </button>
          </li>
        ))}
      </ol>
      <div className="text-sm">
        {phase.step === 'passage-of-time' && <PassageOfTime phase={phase} />}
        {phase.step === 'outpost-event' && <OutpostEvent phase={phase} />}
        {phase.step === 'building-operations' && <BuildingOperations />}
        {phase.step === 'downtime' && <DowntimeOverview />}
        {phase.step === 'construction' && <Construction />}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {next ? (
          <button className="btn btn-primary" onClick={() => go(next)}>
            Next: {STEP_NAMES[next]}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => send('outpostPhase.finish').catch(() => {})}>
            Finish outpost phase
          </button>
        )}
      </div>
    </Panel>
  );
}

function PassageOfTime({ phase }: { phase: Phase }) {
  const { state, send } = useCampaign();
  const weeks = gameManager.game.party.weeks;
  const advanced = weeks > phase.startWeek;
  const nextWeek = weeks + 1;
  const sections = gameManager.game.party.weekSections[nextWeek] ?? [];
  // Secretariat passes a week when a scenario ends (automaticPassTime); don't pass it twice.
  const automatic = state!.ext.rules?.automaticPassTime ?? RULE_DEFAULTS.automaticPassTime;
  return (
    <div className="grid gap-2">
      <p>
        Week {weeks} ({season(weeks)}).{' '}
        {automatic
          ? 'Time passed automatically when the scenario ended, including the garden. Only pass a week here if no scenario was played (e.g. the group skipped one).'
          : `Mark the next week on the calendar${sections.length ? `; week ${nextWeek} has section${sections.length === 1 ? '' : 's'} ${sections.join(', ')} to read` : ''}.`}
      </p>
      {advanced ? (
        <p className="text-moss-400">Advanced to week {weeks}.</p>
      ) : (
        <div>
          <button className={`btn ${automatic ? '' : 'btn-primary'}`} onClick={() => send('party.passWeek').catch(() => {})}>
            Pass a week (to week {nextWeek})
          </button>
        </div>
      )}
    </div>
  );
}

function OutpostEvent({ phase }: { phase: Phase }) {
  const { state, send } = useCampaign();
  const type = `${season(gameManager.game.party.weeks)}-outpost`;
  const deck = state!.ghs.party.eventDecks[type] ?? [];
  return (
    <div className="grid gap-2">
      {phase.event ? (
        <p>
          Drew {eventDeckName(phase.event.type)} {phase.event.cardId}
          {state!.ext.eventDraft ? ': resolve it above.' : state!.ext.eventFollowUps?.length ? ': finish the follow-ups above.' : '.'}
        </p>
      ) : (
        <>
          <p>Draw the top card of the {eventDeckName(type)} deck and resolve it. An outpost attack follows on the back if the card says so.</p>
          <div>
            <button
              className="btn btn-primary"
              disabled={deck.length === 0 || !!state!.ext.eventDraft}
              onClick={() => send('eventDraw.start', { type }).catch(() => {})}
            >
              Draw {eventDeckName(type)} event ({deck.length} left)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function BuildingOperations() {
  const campaign = gameManager.campaignManager.campaignData();
  const buildings = gameManager.game.party.buildings
    .filter((b) => b.level > 0)
    .map((model) => ({ model, data: campaign.buildings?.find((d) => d.name === model.name) }))
    .filter((b) => b.data)
    .sort((a, b) => (a.data!.id || '').localeCompare(b.data!.id || '', undefined, { numeric: true }));
  return (
    <div className="grid gap-2">
      <p className="text-frost-400">Resolve each building's effect in number order; wrecked buildings apply their wrecked effect instead.</p>
      <ul className="grid gap-1">
        {buildings.map(({ model, data }) => {
          const i = model.level - 1;
          const wrecked = model.state === 'wrecked';
          const effect = (wrecked ? data!.effectWrecked : data!.effectNormal)?.[i];
          const interaction = (wrecked ? data!.interactionsUnavailable : data!.interactionsAvailable)?.[i];
          return (
            <li key={model.name} className="flex gap-2">
              <span className="w-8 text-right font-mono text-frost-400">{data!.id}</span>
              <span className="w-40 shrink-0">
                {buildingName(model.name)} {model.level}
                {model.state !== 'normal' && <span className="ml-1 text-xs text-ember-400">{model.state}</span>}
              </span>
              <span className="grid">
                {effect && <span className={wrecked ? 'text-blood-400' : 'text-frost-200'}>{ghsText(effect)}</span>}
                {interaction && <span className="text-frost-400">{wrecked ? 'Unavailable: ' : ''}{ghsText(interaction)}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DowntimeOverview() {
  const characters = gameManager.game.figures.filter((f): f is Character => f instanceof Character);
  return (
    <div className="grid gap-2">
      <p className="text-frost-400">
        Each player levels up, buys, crafts and brews, enhances, and retires characters whose personal quest is done. Use the Downtime panel on the{' '}
        <Link href="/characters" className="underline">
          Characters
        </Link>{' '}
        tab.
      </p>
      <ul className="grid gap-1">
        {characters.map((c) => {
          const nextXp = gameManager.characterManager.xpMap[c.level];
          const canLevel = nextXp !== undefined && c.progress.experience >= nextXp && c.level < 9;
          const picks = cardsToPick(c).count;
          return (
            <li key={c.name} className="flex flex-wrap gap-2">
              <span className="w-40">{gameManager.characterManager.characterName(c)}</span>
              <span className="text-frost-400">
                level {c.level} · {c.progress.experience} XP · {c.progress.gold} gold
              </span>
              {canLevel && <span className="text-moss-400">can level up</span>}
              {picks > 0 && <span className="text-ice-300">{picks} card{picks === 1 ? '' : 's'} to pick</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Construction() {
  const { send } = useCampaign();
  const [paying, setPaying] = useState<string>();
  const campaign = gameManager.campaignManager.campaignData();
  const options = gameManager.game.party.buildings
    .map((model) => {
      const data = campaign.buildings?.find((d) => d.name === model.name);
      const step = data ? buildingStep(model, data) : undefined;
      return { model, data, step };
    })
    .filter((b) => b.data && b.step && !b.step.manual)
    .sort((a, b) => (a.data!.id || '').localeCompare(b.data!.id || '', undefined, { numeric: true }));
  const current = options.find((o) => o.model.name === paying);
  return (
    <div className="grid gap-2">
      <p className="text-frost-400">Build or upgrade one building (more with the right campaign effects), and repair or rebuild as you can afford.</p>
      <ul className="grid gap-1">
        {options.map(({ model, data, step }) => (
          <li key={model.name} className="flex items-center gap-2">
            <span className="w-8 text-right font-mono text-frost-400">{data!.id}</span>
            <span className="flex-1">
              {buildingName(model.name)} <span className="text-frost-400">{model.level ? `level ${model.level}` : 'not built'}</span>
            </span>
            <button className="btn px-2 py-0.5 text-xs" onClick={() => setPaying(model.name)}>
              {{ build: 'Build', upgrade: 'Upgrade', repair: 'Repair', rebuild: 'Rebuild', soldier: '' }[step!.action]}…
            </button>
          </li>
        ))}
      </ul>
      {current && current.step && (
        <PaymentDialog
          title={`${buildingName(current.model.name)}: ${current.step.action}`}
          costs={current.step.costs}
          discount={current.step.action !== 'repair' && carpenterDiscount()}
          allowMorale={current.step.action === 'repair'}
          onPay={(payment) =>
            send(
              current.step!.action === 'repair' ? 'building.repair' : current.step!.action === 'rebuild' ? 'building.rebuild' : 'building.construct',
              { name: current.model.name, payment }
            )
          }
          onMorale={() => send('building.repair', { name: current.model.name, morale: true })}
          onClose={() => setPaying(undefined)}
        />
      )}
    </div>
  );
}
