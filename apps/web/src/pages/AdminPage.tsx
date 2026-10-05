import { useEffect, useState } from 'react';
import { api, type Me } from '../lib/api';
import { useMe } from '../lib/me';

interface Invite {
  id: string;
  role: 'admin' | 'player';
  note: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export function AdminPage() {
  const me = useMe();
  const [users, setUsers] = useState<Me[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newInvite, setNewInvite] = useState<string>();
  const [note, setNote] = useState('');
  const [role, setRole] = useState<'player' | 'admin'>('player');
  const [error, setError] = useState<string>();

  async function refresh() {
    const [u, i] = await Promise.all([api<Me[]>('/api/users'), api<Invite[]>('/api/admin/invites')]);
    setUsers(u);
    setInvites(i.reverse());
  }

  useEffect(() => {
    refresh().catch((e: Error) => setError(e.message));
  }, []);

  if (me.role !== 'admin') {
    return <p className="text-frost-400">Admins only.</p>;
  }

  async function createInvite() {
    try {
      const result = await api<{ url: string }>('/api/admin/invites', { method: 'POST', json: { role, note: note || undefined } });
      setNewInvite(result.url);
      setNote('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="panel p-4">
        <h2 className="mb-3 font-medium">Players</h2>
        <ul className="divide-y divide-ink-600">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {u.displayName} <span className="text-frost-400">@{u.username}</span>
              </span>
              <span className="text-xs uppercase text-frost-400">{u.role}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel grid content-start gap-3 p-4">
        <h2 className="font-medium">Invite a player</h2>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input className="input" placeholder="Note (e.g. who it's for)" value={note} onChange={(e) => setNote(e.target.value)} />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as 'player' | 'admin')}>
            <option value="player">Player</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={createInvite}>
          Create invite link
        </button>
        {newInvite && (
          <div className="rounded-lg border border-ice-500/40 bg-ice-500/10 p-3 text-sm">
            <p className="mb-2 text-frost-300">Send this link privately. It works once and expires in 7 days.</p>
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={newInvite} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={() => navigator.clipboard.writeText(newInvite)}>
                Copy
              </button>
            </div>
          </div>
        )}
        <h3 className="mt-2 text-sm font-medium text-frost-300">Invites</h3>
        <ul className="divide-y divide-ink-600 text-sm">
          {invites.map((i) => (
            <li key={i.id} className="flex justify-between py-2">
              <span>
                {i.note || <span className="text-frost-400">(no note)</span>} <span className="text-xs text-frost-400">{i.role}</span>
              </span>
              <span className="text-xs text-frost-400">
                {i.usedAt ? 'used' : new Date(i.expiresAt) < new Date() ? 'expired' : `expires ${new Date(i.expiresAt).toLocaleDateString()}`}
              </span>
            </li>
          ))}
        </ul>
        {error && <p className="text-sm text-blood-400">{error}</p>}
      </section>
    </div>
  );
}
