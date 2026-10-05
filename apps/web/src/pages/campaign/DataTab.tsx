import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
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
  const revision = useCampaign((s) => s.revision);
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    api<PlaySession[]>(`/api/campaigns/${campaignId}/sessions`).then(setSessions, () => {});
  }, [campaignId, revision]);

  const active = sessions.find((s) => !s.endedAt);

  async function startSession(mode: 'physical' | 'online') {
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
    <div className="grid gap-4 md:grid-cols-2">
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
    </div>
  );
}
