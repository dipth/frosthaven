import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { api, type CampaignSummary } from '../lib/api';

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    api<CampaignSummary[]>('/api/campaigns').then(setCampaigns, (e: Error) => setError(e.message));
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/api/campaigns', { method: 'POST', json: { name } });
      navigate(`/campaigns/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    setBusy(true);
    setError(undefined);
    try {
      const data = JSON.parse(await file.text());
      const { id } = await api<{ id: string }>('/api/campaigns/import', { method: 'POST', json: { filename: file.name, data } });
      navigate(`/campaigns/${id}`);
    } catch (e) {
      setError(e instanceof SyntaxError ? 'That file is not valid JSON' : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-4 text-2xl font-semibold">Campaigns</h1>
        {!campaigns && !error && <p className="text-frost-400">Loading…</p>}
        {campaigns?.length === 0 && <p className="text-frost-400">No campaigns yet. Import your Secretariat data or start a new one.</p>}
        <ul className="grid gap-3">
          {campaigns?.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`} className="panel block p-4 transition hover:border-ice-500/60">
                <div className="text-lg font-medium">{c.name}</div>
                <div className="text-xs text-frost-400">
                  Updated {new Date(c.updatedAt).toLocaleString()} · revision {c.revision}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <aside className="grid content-start gap-4">
        <form onSubmit={create} className="panel grid gap-3 p-4">
          <h2 className="font-medium">New campaign</h2>
          <input className="input" placeholder="Party name" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn btn-primary" disabled={busy}>
            Create
          </button>
        </form>
        <div className="panel grid gap-3 p-4">
          <h2 className="font-medium">Import from Secretariat</h2>
          <p className="text-sm text-frost-400">
            In Gloomhaven Secretariat open Menu → Data Management and export the game or a data dump.
          </p>
          <label className="btn cursor-pointer">
            Choose file…
            <input type="file" accept=".json,application/json" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          </label>
        </div>
        {error && <p className="text-sm text-blood-400">{error}</p>}
      </aside>
    </div>
  );
}
