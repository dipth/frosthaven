/** Physical sync checklist: what to change in the box after online play. */
import { CHECKLIST_GROUPS, type ChecklistItem } from '@fh/engine';
import { useEffect, useState } from 'react';
import { Panel } from '../../components/ui';
import { api } from '../../lib/api';
import { useCampaign } from '../../lib/campaign-store';

interface Checklist {
  baselineRevision: number | null;
  items: ChecklistItem[];
}

export function useChecklist(campaignId: string) {
  const revision = useCampaign((s) => s.revision);
  const [checklist, setChecklist] = useState<Checklist>();
  useEffect(() => {
    api<Checklist>(`/api/campaigns/${campaignId}/checklist`).then(setChecklist, () => {});
  }, [campaignId, revision]);
  return checklist;
}

export function SyncTab({ campaignId }: { campaignId: string }) {
  const { state, send } = useCampaign();
  const checklist = useChecklist(campaignId);
  const ticks = new Set(state!.ext.checklistTicks ?? []);
  if (!checklist) return <p className="text-sm text-frost-400">Loading…</p>;

  const markSynced = async () => {
    const open = checklist.items.filter((i) => !ticks.has(i.id)).length;
    if (open && !confirm(`${open} change${open === 1 ? ' is' : 's are'} not ticked off. Mark the box as in sync anyway?`)) return;
    await api(`/api/campaigns/${campaignId}/checklist/synced`, { method: 'POST' }).catch(() => {});
  };

  if (checklist.baselineRevision === null) {
    return (
      <Panel title="Physical box" className="max-w-2xl">
        <p className="mb-3 text-sm text-frost-300">
          The app doesn't know yet what the physical box looks like. Once the box matches the app (sheets, decks, item supply, outpost map), mark it as in sync;
          from then on this page lists everything to change after online play.
        </p>
        <button className="btn btn-primary" onClick={markSynced}>
          The box matches the app now
        </button>
      </Panel>
    );
  }

  const done = checklist.items.filter((i) => ticks.has(i.id)).length;
  return (
    <div className="grid gap-4">
      <Panel
        title={`Before the next physical session · ${done}/${checklist.items.length} done`}
        actions={
          <button className="btn btn-primary" onClick={markSynced}>
            Mark the box as in sync
          </button>
        }
      >
        {checklist.items.length === 0 ? (
          <p className="text-sm text-moss-400">The physical box matches the app.</p>
        ) : (
          <p className="text-sm text-frost-400">Tick things off as you change the box. Everyone sees the same ticks.</p>
        )}
      </Panel>
      {CHECKLIST_GROUPS.map(({ key, label }) => {
        const items = checklist.items.filter((i) => i.group === key);
        if (!items.length) return null;
        return (
          <Panel key={key} title={label}>
            <ul className="grid gap-1 text-sm">
              {items.map((item) => (
                <li key={item.id}>
                  <label className={`flex items-start gap-2 ${ticks.has(item.id) ? 'text-frost-400 line-through' : ''}`}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={ticks.has(item.id)}
                      onChange={(e) => send('checklist.tick', { id: item.id, done: e.target.checked }).catch(() => {})}
                    />
                    {item.text}
                  </label>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
