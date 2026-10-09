import { conclusionChoices, type PendingConclusion } from '@fh/engine';
import { gameManager } from '@fh/ghs-core';
import { useState } from 'react';
import { useCampaign } from '../lib/campaign-store';
import { SectionLink } from './BookPages';
import { Modal } from './ui';

/** Sections the group has to read and resolve, shown on every campaign screen. */
export function PendingSections() {
  const { state, send } = useCampaign();
  const [resolving, setResolving] = useState<PendingConclusion>();
  const pending = state?.ext.pendingConclusions ?? [];
  if (!pending.length) {
    return null;
  }
  return (
    <div className="rounded-xl border border-ice-500/40 bg-ice-500/10 px-4 py-3">
      <div className="mb-2 text-sm font-medium text-ice-300">Sections to read</div>
      <ul className="grid gap-2">
        {pending.map((p) => (
          <li key={p.section} className="flex flex-wrap items-center gap-2 text-sm">
            {p.edition === 'fh' ? <SectionLink section={p.section} className="font-mono text-base" /> : <span className="font-mono text-base">§{p.section}</span>}
            <span className="text-frost-400">{p.reason}</span>
            <span className="ml-auto flex gap-2">
              {p.kind === 'conclusion' ? (
                <button className="btn btn-primary" onClick={() => setResolving(p)}>
                  Resolve…
                </button>
              ) : (
                <button className="btn" onClick={() => send('conclusion.dismiss', { section: p.section }).catch(() => {})}>
                  Done reading
                </button>
              )}
              {p.kind === 'conclusion' && (
                <button
                  className="btn"
                  title="Remove without applying (e.g. already applied at the table)"
                  onClick={() => confirm(`Dismiss §${p.section} without applying it?`) && send('conclusion.dismiss', { section: p.section }).catch(() => {})}
                >
                  Dismiss
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {resolving && <ResolveModal pending={resolving} onClose={() => setResolving(undefined)} />}
    </div>
  );
}

function ResolveModal({ pending, onClose }: { pending: PendingConclusion; onClose(): void }) {
  const { send } = useCampaign();
  const choices = conclusionChoices({ gm: gameManager, game: gameManager.game }, pending.section);
  const [choice, setChoice] = useState<string>(choices[0]?.index ?? '');
  const sectionIndex = choices.length ? choice : pending.section;
  const section = gameManager.sectionData('fh').find((s) => s.index === sectionIndex);
  const rewards = section?.rewards;
  const [location, setLocation] = useState(rewards?.chooseLocation?.[0] ?? '');
  const [unlock, setUnlock] = useState(rewards?.chooseUnlockCharacter?.[0] ?? '');
  const [weeks, setWeeks] = useState<number[]>(rewards?.calendarSectionManual?.map(() => -1) ?? []);
  const [error, setError] = useState<string>();

  async function apply() {
    try {
      await send('conclusion.finish', {
        section: pending.section,
        choice: choices.length ? choice : undefined,
        chooseLocation: location || undefined,
        chooseUnlockCharacter: unlock || undefined,
        calendarSectionManual: weeks.length ? weeks : undefined
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal title={`Section ${pending.section}`} onClose={onClose}>
      <p className="mb-4 text-sm text-frost-400">
        Read §{pending.section} in the section book ({pending.reason}), then apply its rewards here.
      </p>
      {choices.length > 0 && (
        <fieldset className="mb-4">
          <legend className="label">Which outcome did you choose?</legend>
          {choices.map((c) => (
            <label key={c.index} className="flex items-center gap-2 py-1 text-sm">
              <input type="radio" name="choice" checked={choice === c.index} onChange={() => setChoice(c.index)} />
              §{c.index} {c.name}
            </label>
          ))}
        </fieldset>
      )}
      {rewards?.chooseLocation && (
        <label className="mb-3 block text-sm">
          <span className="label">Location to unlock</span>
          <select className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
            {rewards.chooseLocation.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      )}
      {rewards?.chooseUnlockCharacter && (
        <label className="mb-3 block text-sm">
          <span className="label">Character to unlock</span>
          <select className="input" value={unlock} onChange={(e) => setUnlock(e.target.value)}>
            {rewards.chooseUnlockCharacter.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      )}
      {rewards?.calendarSectionManual?.map((manual, i) => (
        <label key={i} className="mb-3 block text-sm">
          <span className="label">Write §{manual.section} into the calendar in how many weeks?</span>
          <input
            className="input w-24"
            inputMode="numeric"
            value={weeks[i] === -1 ? '' : weeks[i]}
            placeholder="skip"
            onChange={(e) => setWeeks((w) => w.map((v, j) => (j === i ? (e.target.value === '' ? -1 : Number(e.target.value)) : v)))}
          />
        </label>
      ))}
      {error && <p className="mb-3 text-sm text-blood-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={apply}>
          Apply section
        </button>
      </div>
    </Modal>
  );
}
