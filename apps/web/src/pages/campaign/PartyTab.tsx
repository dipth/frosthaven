import { SOLDIER_COSTS, soldierCapacity } from '@fh/engine';
import { gameManager } from '@fh/ghs-core';
import { useState } from 'react';
import { PaymentDialog } from '../../components/PaymentDialog';
import { AddInput, Chip, NotesField, Panel, StatRow, Stepper } from '../../components/ui';
import { useCampaign } from '../../lib/campaign-store';
import { lootName, season, stickerName } from '../../lib/labels';

const RESOURCES = ['lumber', 'metal', 'hide', 'arrowvine', 'axenut', 'corpsecap', 'flamefruit', 'rockroot', 'snowthistle'] as const;
const FH_PROSPERITY_STEPS = [5, 14, 26, 41, 59, 80, 104, 131];

function moraleDefense(morale: number) {
  if (morale < 3) return -10;
  if (morale < 5) return -5;
  if (morale < 8) return 0;
  if (morale < 11) return 5;
  if (morale < 14) return 10;
  return 15;
}

export function PartyTab() {
  const { state, send } = useCampaign();
  const party = state!.ghs.party;
  const run = (type: string, payload: unknown) => send(type, payload).catch(() => {});
  const campaign = gameManager.campaignManager.campaignData();
  const prosperityLevel = 1 + FH_PROSPERITY_STEPS.filter((step) => party.prosperity > step).length;
  const nextStep = FH_PROSPERITY_STEPS.find((step) => party.prosperity <= step);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
      <Panel title="Outpost">
        <StatRow label={`Prosperity · level ${prosperityLevel}`} hint={nextStep ? `level ${prosperityLevel + 1} after ${nextStep + 1} checkmarks` : 'maximum'}>
          <Stepper value={party.prosperity} max={132} onChange={(value) => run('party.setProsperity', { value })} />
        </StatRow>
        <StatRow label="Morale" hint={`defense ${moraleDefense(party.morale) >= 0 ? '+' : ''}${moraleDefense(party.morale)} from morale`}>
          <Stepper value={party.morale} max={20} onChange={(value) => run('party.setMorale', { value })} />
        </StatRow>
        <StatRow label="Total defense">
          <Stepper value={party.defense + moraleDefense(party.morale)} min={-50} max={200} onChange={(total) => run('party.setTotalDefense', { total })} />
        </StatRow>
        <StatRow label="Soldiers">
          <Stepper value={party.soldiers} max={20} onChange={(value) => run('party.setSoldiers', { value })} />
          <RecruitSoldier />
        </StatRow>
        <StatRow label="Inspiration">
          <Stepper value={party.inspiration} onChange={(value) => run('party.setInspiration', { value })} />
        </StatRow>
      </Panel>

      <Panel title="Resources (outpost supply)">
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {RESOURCES.map((type) => (
            <StatRow key={type} label={lootName(type)}>
              <Stepper value={party.loot[type] ?? 0} onChange={(value) => run('party.setResource', { type, value })} width="w-12" />
            </StatRow>
          ))}
        </div>
      </Panel>

      <CalendarPanel />

      <Panel title="Town guard">
        <StatRow label="Perk checkmarks" hint={`${Math.floor(party.townGuardPerks / 3)} perk(s) earned, ${party.townGuardPerkSections?.length ?? 0} chosen`}>
          <Stepper value={party.townGuardPerks} max={100} onChange={(value) => run('party.setTownGuardPerks', { value })} />
        </StatRow>
        <ul className="mt-2 grid gap-1 text-sm">
          {campaign.townGuardPerks?.map((perk, i) => {
            const chosen = perk.sections.find((s) => party.townGuardPerkSections?.includes(s));
            return (
              <li key={i} className="flex items-center gap-2">
                <span className="text-frost-400">#{i + 1}</span>
                {perk.sections.map((section) => (
                  <label key={section} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={party.townGuardPerkSections?.includes(section) ?? false}
                      disabled={!!chosen && chosen !== section}
                      onChange={() => run('party.toggleTownGuardPerkSection', { section })}
                    />
                    <span>§{section}</span>
                  </label>
                ))}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Campaign stickers">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {party.campaignStickers.length === 0 && <span className="text-sm text-frost-400">None placed.</span>}
          {party.campaignStickers.map((sticker, i) => (
            <Chip key={`${sticker}-${i}`} onRemove={() => run('party.removeCampaignSticker', { sticker })}>
              {stickerName(sticker)}
            </Chip>
          ))}
        </div>
        <AddInput
          placeholder="Add sticker…"
          options={(campaign.campaignStickers ?? []).map((s) => {
            const key = s.split(':')[0]!;
            return { value: key, label: stickerName(key) };
          })}
          onAdd={(sticker) => run('party.addCampaignSticker', { sticker })}
        />
      </Panel>

      <Panel title="Party">
        <label className="label">Notes</label>
        <NotesField value={party.notes ?? ''} onSave={(notes) => run('party.setNotes', { notes })} placeholder="Shared party notes" />
        <label className="label mt-3">Players</label>
        <PlayersField players={party.players ?? []} onSave={(players) => run('party.setPlayers', { players })} />
        <StatRow label="Campaign mode" hint="Rewards and unlocks are applied automatically">
          <input type="checkbox" checked={party.campaignMode} onChange={() => run('party.toggleCampaignMode', {})} />
        </StatRow>
      </Panel>

      <ScenariosPanel />
    </div>
  );
}

function PlayersField({ players, onSave }: { players: string[]; onSave(players: string[]): void }) {
  const [draft, setDraft] = useState<string>();
  const value = draft ?? players.join(', ');
  return (
    <input
      className="input"
      placeholder="Comma separated"
      value={value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== undefined) {
          onSave(draft.split(',').map((p) => p.trim()).filter(Boolean).slice(0, 4));
          setDraft(undefined);
        }
      }}
    />
  );
}

function CalendarPanel() {
  const { state, send } = useCampaign();
  const party = state!.ghs.party;
  const campaign = gameManager.campaignManager.campaignData();
  const [week, setWeek] = useState('');
  const [section, setSection] = useState('');
  const upcoming: { week: number; sections: { section: string; fixed: boolean }[] }[] = [];
  for (let w = party.weeks + 1; w <= Math.min(party.weeks + 20, 80); w++) {
    const fixed = (campaign.weeks?.[w] ?? []).map((s) => ({ section: s, fixed: true }));
    const manual = (party.weekSections?.[w] ?? []).map((s) => ({ section: s, fixed: false }));
    if (fixed.length || manual.length) {
      upcoming.push({ week: w, sections: [...fixed, ...manual] });
    }
  }

  return (
    <Panel title="Calendar">
      <StatRow label={`Week ${party.weeks}`} hint={`${season(party.weeks)} · passing weeks applies calendar sections`}>
        <Stepper value={party.weeks} max={160} onChange={(value) => send('party.setWeek', { value }).catch(() => {})} />
      </StatRow>
      <div className="mt-2">
        <div className="label">Upcoming sections</div>
        {upcoming.length === 0 && <p className="text-sm text-frost-400">Nothing in the next 20 weeks.</p>}
        <ul className="grid gap-1 text-sm">
          {upcoming.map(({ week: w, sections }) => (
            <li key={w} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-frost-400">Week {w}</span>
              {sections.map(({ section: s, fixed }) =>
                fixed ? (
                  <Chip key={s}>§{s}</Chip>
                ) : (
                  <Chip key={s} onRemove={() => send('party.removeWeekSection', { week: w, section: s }).catch(() => {})}>
                    §{s}
                  </Chip>
                )
              )}
            </li>
          ))}
        </ul>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send('party.addWeekSection', { week: Number(week), section })
            .then(() => setSection(''))
            .catch(() => {});
        }}
      >
        <input className="input w-20" placeholder="Week" inputMode="numeric" value={week} onChange={(e) => setWeek(e.target.value)} />
        <input className="input" placeholder="Section, e.g. 112.3" value={section} onChange={(e) => setSection(e.target.value)} />
        <button className="btn" disabled={!week || !section}>
          Write in
        </button>
      </form>
    </Panel>
  );
}

function ScenariosPanel() {
  const { state, send } = useCampaign();
  const party = state!.ghs.party;
  const scenarios = gameManager.scenarioManager.scenarioData('fh', true).filter((s) => !s.group);
  const nameOf = (index: string) => scenarios.find((s) => s.index === index)?.name ?? '';
  const completed = [...new Set(party.scenarios.filter((s) => s.edition === 'fh' && !s.group).map((s) => s.index))].sort((a, b) => +a - +b);
  const available = scenarios.filter((s) => !completed.includes(s.index) && !gameManager.scenarioManager.isLocked(s) && !gameManager.scenarioManager.isBlocked(s));

  return (
    <Panel title="Scenarios" className="lg:col-span-2">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div>
          <div className="label">Available ({available.length})</div>
          <ul className="max-h-64 overflow-y-auto text-sm">
            {available.map((s) => (
              <li key={s.index} className="flex items-center gap-2 py-0.5">
                <span className="w-8 text-right font-mono text-frost-400">{s.index}</span>
                <span>{s.name}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <AddInput
              placeholder="Unlock scenario #"
              buttonLabel="Unlock"
              options={scenarios.map((s) => ({ value: s.index, label: `${s.index} ${s.name}` }))}
              onAdd={(index) => send('party.unlockScenario', { index }).catch(() => {})}
            />
          </div>
        </div>
        <div>
          <div className="label">Completed ({completed.length})</div>
          <ul className="max-h-64 overflow-y-auto text-sm">
            {completed.map((index) => (
              <li key={index} className="flex items-center gap-2 py-0.5 text-frost-300">
                <span className="w-8 text-right font-mono text-frost-400">{index}</span>
                <span>{nameOf(index)}</span>
              </li>
            ))}
          </ul>
          <div className="label mt-3">Sections read ({party.conclusions.length})</div>
          <p className="text-xs text-frost-400">{party.conclusions.map((c) => c.index).join(', ') || 'None yet.'}</p>
        </div>
      </div>
    </Panel>
  );
}


function RecruitSoldier() {
  const { send } = useCampaign();
  const [open, setOpen] = useState(false);
  const capacity = soldierCapacity();
  const party = gameManager.game.party;
  return (
    <>
      <button
        className="btn ml-2 h-7 px-2 text-xs"
        disabled={party.soldiers >= capacity}
        title={capacity ? `Barracks hold ${capacity} soldiers` : 'Needs working barracks'}
        onClick={() => setOpen(true)}
      >
        Recruit…
      </button>
      {open && (
        <PaymentDialog
          title="Recruit a soldier"
          costs={SOLDIER_COSTS}
          discount={false}
          onPay={(payment) => send('party.recruitSoldier', { payment })}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
