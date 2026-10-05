import { characterKey, isClassUnlocked, playableClasses } from '@fh/engine';
import { gameManager } from '@fh/ghs-core';
import { useEffect, useMemo, useState } from 'react';
import { api, type Me } from '../../lib/api';
import { useCampaign } from '../../lib/campaign-store';
import { characterName } from '../../lib/labels';
import { useMe } from '../../lib/me';

export function OverviewTab() {
  const { state, send } = useCampaign();
  const me = useMe();
  const [users, setUsers] = useState<Me[]>([]);
  const [newClass, setNewClass] = useState('');
  const [partyName, setPartyName] = useState(state!.ghs.party.name);

  useEffect(() => {
    api<Me[]>('/api/users').then(setUsers, () => {});
  }, []);

  const unlocked = state!.ghs.party.unlockedCharacters ?? [];
  const classes = useMemo(
    () =>
      playableClasses(gameManager)
        .map((c) => ({
          value: `${c.edition}:${c.name}`,
          label: isClassUnlocked(unlocked, c) ? characterName(c) : 'Locked class',
          edition: c.edition,
          locked: !isClassUnlocked(unlocked, c)
        }))
        .filter((c) => !c.locked)
        .sort((a, b) => (a.edition === b.edition ? a.label.localeCompare(b.label) : a.edition === 'fh' ? -1 : 1)),
    [unlocked]
  );

  const ghs = state!.ghs;
  const party = ghs.party;
  const ownerName = (key: string) => users.find((u) => u.id === state!.ext.characterOwners[key])?.displayName;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_340px]">
      <section className="panel p-4">
        <h2 className="mb-3 font-medium">Characters in play</h2>
        {ghs.characters.length === 0 && <p className="text-sm text-frost-400">No characters yet.</p>}
        <ul className="grid gap-2">
          {ghs.characters.map((c) => {
            const key = characterKey(c);
            return (
              <li key={key} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-600 bg-ink-850 px-3 py-2">
                <span className="font-medium">{c.title || characterName(c)}</span>
                <span className="text-xs text-frost-400">
                  {characterName(c)} · level {c.level}
                  {c.edition !== 'fh' && ' · crossover'}
                </span>
                <select
                  className="input ml-auto w-auto py-1 text-xs"
                  value={state!.ext.characterOwners[key] ?? ''}
                  onChange={(e) => send('character.setOwner', { edition: c.edition, name: c.name, userId: e.target.value || null })}
                  disabled={!!state!.ext.characterOwners[key] && state!.ext.characterOwners[key] !== me.id && me.role !== 'admin'}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
                {!ownerName(key) && <span className="text-xs text-ember-400">no player</span>}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex gap-2">
          <select className="input" value={newClass} onChange={(e) => setNewClass(e.target.value)}>
            <option value="">Add a character…</option>
            {classes.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
                {c.edition !== 'fh' ? ' (crossover)' : ''}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={!newClass}
            onClick={() => {
              const [edition, name] = newClass.split(':');
              send('character.add', { edition, name }).then(() => setNewClass(''), () => {});
            }}
          >
            Add
          </button>
        </div>
      </section>
      <aside className="panel grid content-start gap-3 p-4 text-sm">
        <h2 className="font-medium">Party</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send('party.rename', { name: partyName }).catch(() => {});
          }}
        >
          <input className="input" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
          <button className="btn" disabled={partyName === party.name}>
            Save
          </button>
        </form>
        <dl className="grid grid-cols-2 gap-y-1 text-frost-300">
          <dt className="text-frost-400">Prosperity</dt>
          <dd>{party.prosperity}</dd>
          <dt className="text-frost-400">Morale</dt>
          <dd>{party.morale}</dd>
          <dt className="text-frost-400">Defense</dt>
          <dd>{party.defense}</dd>
          <dt className="text-frost-400">Soldiers</dt>
          <dd>{party.soldiers}</dd>
          <dt className="text-frost-400">Inspiration</dt>
          <dd>{party.inspiration}</dd>
          <dt className="text-frost-400">Week</dt>
          <dd>{party.weeks}</dd>
          <dt className="text-frost-400">Scenarios completed</dt>
          <dd>{party.scenarios.length}</dd>
        </dl>
      </aside>
    </div>
  );
}
