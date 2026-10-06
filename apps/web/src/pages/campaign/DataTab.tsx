import { RULE_DEFAULTS } from '@fh/engine';
import { useEffect, useState } from 'react';
import { api, type Me } from '../../lib/api';
import { useCampaign } from '../../lib/campaign-store';
import { useMe } from '../../lib/me';

interface PlaySession {
  id: string;
  mode: 'physical' | 'online';
  startedAt: string;
  endedAt: string | null;
}

export function DataTab({ campaignId }: { campaignId: string }) {
  const me = useMe();
  const { state } = useCampaign();
  const revision = useCampaign((s) => s.revision);
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    api<PlaySession[]>(`/api/campaigns/${campaignId}/sessions`).then(setSessions, () => {});
  }, [campaignId, revision]);

  const active = sessions.find((s) => !s.endedAt);

  async function startSession(mode: 'physical' | 'online') {
    if (mode === 'physical') {
      const checklist = await api<{ items: { id: string }[] }>(`/api/campaigns/${campaignId}/checklist`).catch(() => undefined);
      const ticks = new Set(state!.ext.checklistTicks ?? []);
      const open = checklist?.items.filter((i) => !ticks.has(i.id)).length ?? 0;
      if (open && !confirm(`The physical box is not in sync with the app yet (${open} change${open === 1 ? '' : 's'} on the Box sync tab). Start the physical session anyway?`)) {
        return;
      }
    }
    await api(`/api/campaigns/${campaignId}/sessions`, { method: 'POST', json: { mode } });
  }

  async function replaceFromFile(file: File) {
    if (!confirm('Replace this campaign with the contents of the file? (This can be undone.)')) {
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      await api(`/api/campaigns/${campaignId}/import`, { method: 'POST', json: { filename: file.name, data } });
      setMessage('Imported.');
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
      <section className="panel grid content-start gap-3 p-4">
        <h2 className="font-medium">Play session</h2>
        {active ? (
          <p className="text-sm">
            A <strong>{active.mode}</strong> session is running since {new Date(active.startedAt).toLocaleString()}.
          </p>
        ) : (
          <p className="text-sm text-frost-400">No session running. Everything is still logged.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => startSession('physical')}>
            Start physical session
          </button>
          <button className="btn" onClick={() => startSession('online')}>
            Start online session
          </button>
          {active && (
            <button className="btn btn-danger" onClick={() => api(`/api/campaigns/${campaignId}/sessions/end`, { method: 'POST' })}>
              End session
            </button>
          )}
        </div>
      </section>
      <section className="panel grid content-start gap-3 p-4">
        <h2 className="font-medium">Gloomhaven Secretariat</h2>
        <p className="text-sm text-frost-400">
          Export files can be imported into Secretariat (Menu → Data Management). The game export keeps your Secretariat settings untouched.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className="btn" href={`/api/campaigns/${campaignId}/export?format=game`}>
            Export game
          </a>
          <a className="btn" href={`/api/campaigns/${campaignId}/export?format=datadump`}>
            Export data dump
          </a>
          {me.role === 'admin' && (
            <label className="btn btn-danger cursor-pointer">
              Replace from file…
              <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && replaceFromFile(e.target.files[0])} />
            </label>
          )}
        </div>
        {message && <p className="text-sm text-frost-300">{message}</p>}
      </section>
      <CampaignSettings />
    </div>
  );
}

const RULE_LABELS: Partial<Record<keyof typeof RULE_DEFAULTS, string>> = {
  events: 'Track event decks',
  eventsApply: 'Apply event outcomes automatically',
  applyLoot: 'Apply loot cards to characters',
  applyConditions: 'Apply conditions automatically',
  automaticPassTime: 'Pass time after scenarios',
  automaticUnlocking: 'Unlock characters and quests automatically',
  applyBuildingRewards: 'Apply building rewards',
  drawRandomItem: 'Draw random items in the app',
  drawRandomScenario: 'Draw random scenarios in the app',
  unlockEnvelopeBuildings: 'Unlock envelope buildings',
  fhChallenges: 'Town hall challenges',
  fhTrials: 'Hall of Revelry trials',
  fhGarden: 'Garden',
  fhPets: 'Pets',
  fhShareResources: 'Share resources (house rule)',
  temporaryEnhancements: 'Temporary enhancements (variant)'
};

function CampaignSettings() {
  const { state, send } = useCampaign();
  const me = useMe();
  const [users, setUsers] = useState<Me[]>([]);
  useEffect(() => {
    api<Me[]>('/api/users').then(setUsers, () => {});
  }, []);
  const rules = { ...RULE_DEFAULTS, ...state!.ext.rules };
  const admin = me.role === 'admin';
  return (
    <section className="panel grid content-start gap-3 p-4 md:col-span-2">
      <h2 className="font-medium">Campaign settings</h2>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-frost-300">Forteller narrator</span>
        <select
          className="input w-auto"
          value={state!.ext.narratorUserId ?? ''}
          onChange={(e) => send('narration.setNarrator', { userId: e.target.value || null }).catch(() => {})}
        >
          <option value="">Everyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName}
            </option>
          ))}
        </select>
        <span className="text-xs text-frost-400">gets the “play this now” cues and plays them from their own Forteller account.</span>
      </label>
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        {(Object.keys(RULE_LABELS) as (keyof typeof RULE_DEFAULTS)[]).map((key) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              disabled={!admin}
              checked={Boolean(rules[key])}
              onChange={(e) => send('campaign.setRule', { key, value: e.target.checked }).catch(() => {})}
            />
            {RULE_LABELS[key]}
          </label>
        ))}
      </div>
      {!admin && <p className="text-xs text-frost-400">Only the admin can change the rules.</p>}
    </section>
  );
}
