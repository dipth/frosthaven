import { availablePerks, characterKey, describePerk, isClassUnlocked, isCrossoverCharacter, playableClasses } from '@fh/engine';
import { Character, gameManager, labelText } from '@fh/ghs-core';
import { useEffect, useMemo, useState } from 'react';
import { Boxes, NotesField, Panel, StatRow, Stepper } from '../../components/ui';
import { api, type Me } from '../../lib/api';
import { useCampaign } from '../../lib/campaign-store';
import { characterName, ghsText, lootName } from '../../lib/labels';
import { useMe } from '../../lib/me';

const RESOURCES = ['lumber', 'metal', 'hide', 'arrowvine', 'axenut', 'corpsecap', 'flamefruit', 'rockroot', 'snowthistle'] as const;

function liveCharacters(): Character[] {
  return gameManager.game.figures.filter((f): f is Character => f instanceof Character);
}

export function CharactersTab() {
  const { state, send } = useCampaign();
  const me = useMe();
  const [users, setUsers] = useState<Me[]>([]);
  const [selected, setSelected] = useState<string>();
  const [newClass, setNewClass] = useState('');

  useEffect(() => {
    api<Me[]>('/api/users').then(setUsers, () => {});
  }, []);

  const characters = liveCharacters();
  const current = characters.find((c) => characterKey(c) === selected) ?? characters.find((c) => state!.ext.characterOwners[characterKey(c)] === me.id) ?? characters[0];
  const unlocked = state!.ghs.party.unlockedCharacters ?? [];
  const classes = useMemo(
    () =>
      playableClasses(gameManager)
        .filter((c) => isClassUnlocked(unlocked, c))
        .map((c) => ({ value: `${c.edition}:${c.name}`, label: characterName(c), crossover: c.edition !== 'fh' }))
        .sort((a, b) => Number(a.crossover) - Number(b.crossover) || a.label.localeCompare(b.label)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unlocked.join()]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="grid content-start gap-3">
        <Panel title="Party">
          <ul className="grid gap-1">
            {characters.map((c) => {
              const key = characterKey(c);
              const owner = users.find((u) => u.id === state!.ext.characterOwners[key]);
              return (
                <li key={key}>
                  <button
                    onClick={() => setSelected(key)}
                    className={`w-full rounded-lg px-3 py-2 text-left transition ${current && characterKey(current) === key ? 'bg-ink-700' : 'hover:bg-ink-850'}`}
                  >
                    <div className="font-medium">{c.title || characterName(c)}</div>
                    <div className="text-xs text-frost-400">
                      {characterName(c)} · L{c.level}
                      {owner ? ` · ${owner.displayName}` : ' · no player'}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 grid gap-2">
            <select className="input" value={newClass} onChange={(e) => setNewClass(e.target.value)}>
              <option value="">New character…</option>
              {classes.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                  {c.crossover ? ' (crossover)' : ''}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              disabled={!newClass}
              onClick={() => {
                const [edition, name] = newClass.split(':');
                send('character.add', { edition, name })
                  .then(() => {
                    setSelected(newClass);
                    setNewClass('');
                  })
                  .catch(() => {});
              }}
            >
              Add character
            </button>
          </div>
        </Panel>
        <RetiredPanel />
      </aside>
      {current ? <CharacterSheet key={characterKey(current)} character={current} users={users} /> : <p className="text-frost-400">No characters yet.</p>}
    </div>
  );
}

function CharacterSheet({ character, users }: { character: Character; users: Me[] }) {
  const { state, send } = useCampaign();
  const me = useMe();
  const ref = { edition: character.edition, name: character.name };
  const run = (type: string, payload: object = {}) => send(type, { ...ref, ...payload }).catch(() => {});
  const key = characterKey(character);
  const owner = state!.ext.characterOwners[key];
  const canEdit = me.role === 'admin' || !owner || owner === me.id;
  const progress = character.progress;
  const crossover = isCrossoverCharacter(character);
  const needsVerification = state!.ext.crossoverPerksToVerify?.includes(key);
  const free = availablePerks(character);
  const xpForNext = gameManager.characterManager.xpMap[character.level];

  return (
    <div className="grid gap-4">
      <Panel
        title={
          <span>
            {character.title || characterName(character)} <span className="text-sm font-normal text-frost-400">{characterName(character)}{crossover ? ' · crossover' : ''}</span>
          </span>
        }
        actions={
          <select
            className="input w-auto py-1 text-xs"
            value={owner ?? ''}
            disabled={!canEdit}
            onChange={(e) => send('character.setOwner', { ...ref, userId: e.target.value || null }).catch(() => {})}
          >
            <option value="">No player</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        }
      >
        {!canEdit && <p className="mb-2 text-xs text-frost-400">Only this character's player (or an admin) can edit it.</p>}
        <div className="grid gap-x-6 md:grid-cols-2">
          <div>
            <StatRow label="Name">
              <TitleInput value={character.title || characterName(character)} disabled={!canEdit} onSave={(title) => run('character.setTitle', { title })} />
            </StatRow>
            <StatRow label={`Level ${character.level}`} hint={`${character.maxHealth} hit points · hand size ${character.handSize}`}>
              <Stepper value={character.level} min={1} max={9} disabled={!canEdit} onChange={(level) => run('character.setLevel', { level })} />
            </StatRow>
            <StatRow label="Experience" hint={xpForNext ? `level ${character.level + 1} at ${xpForNext}` : 'maximum level'}>
              <Stepper value={progress.experience} max={9999} width="w-16" disabled={!canEdit} onChange={(experience) => run('character.setXP', { experience })} />
            </StatRow>
            <StatRow label="Gold">
              <Stepper value={progress.gold} max={99999} width="w-16" disabled={!canEdit} onChange={(gold) => run('character.setGold', { gold })} />
            </StatRow>
            <StatRow label="Battle goal checkmarks" hint={`${Math.min(6, Math.floor(progress.battleGoals / 3))} perk(s) earned`}>
              <Stepper value={progress.battleGoals} max={18} disabled={!canEdit} onChange={(battleGoals) => run('character.setBattleGoals', { battleGoals })} />
            </StatRow>
            {character.traits?.length > 0 && (
              <StatRow label="Traits">
                <span className="text-sm text-frost-300">{character.traits.map((t) => labelText(`data.character.traits.${t}`)).join(', ')}</span>
              </StatRow>
            )}
          </div>
          <div>
            <div className="label mt-1.5">Resources</div>
            <div className="grid grid-cols-1 gap-x-4 xl:grid-cols-2">
              {RESOURCES.map((type) => (
                <StatRow key={type} label={lootName(type)}>
                  <Stepper value={progress.loot[type] ?? 0} width="w-10" disabled={!canEdit} onChange={(value) => run('character.setResource', { type, value })} />
                </StatRow>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Perks"
        actions={<span className={`text-sm ${free > 0 ? 'text-moss-400' : 'text-frost-400'}`}>{free} checkmark{free === 1 ? '' : 's'} available</span>}
      >
        {needsVerification && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-ember-400/40 bg-ember-400/10 px-3 py-2 text-sm">
            <span>
              Secretariat stored this crossover character's perks against the old Gloomhaven list, so these checkmarks were filled in from the top. Match them to your
              official crossover sheet, then confirm.
            </span>
            <button className="btn ml-auto" onClick={() => run('character.confirmCrossoverPerks')} disabled={!canEdit}>
              Perks match my sheet
            </button>
          </div>
        )}
        <ul className="grid gap-1.5">
          {character.perks.map((perk, index) => (
            <li key={index} className="flex items-start gap-3 text-sm">
              <Boxes
                count={perk.count}
                value={progress.perks[index] ?? 0}
                disabled={!canEdit}
                onChange={(value) => run('character.setPerk', { index, value, force: me.role === 'admin' })}
              />
              <span className="text-frost-300">{describePerk(perk as never)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-x-6 sm:grid-cols-2">
          <StatRow label="Extra perks" hint="from rewards">
            <Stepper value={progress.extraPerks} max={99} disabled={!canEdit} onChange={(value) => run('character.setExtraPerks', { value })} />
          </StatRow>
          <StatRow label="Retirements" hint="previous characters retired">
            <Stepper value={progress.retirements} max={99} disabled={!canEdit} onChange={(value) => run('character.setRetirements', { value })} />
          </StatRow>
        </div>
        {character.masteries?.length > 0 && (
          <>
            <div className="label mt-4">Masteries</div>
            <ul className="grid gap-1.5 text-sm">
              {character.masteries.map((mastery, index) => (
                <li key={index} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={progress.masteries?.includes(index) ?? false}
                    disabled={!canEdit}
                    onChange={() => run('character.toggleMastery', { index })}
                  />
                  <span className="text-frost-300">{ghsText(mastery)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Personal quest">
          <PersonalQuest character={character} canEdit={canEdit} run={run} />
        </Panel>
        <Panel title="Items">
          <Items character={character} canEdit={canEdit} run={run} />
        </Panel>
      </div>

      <Panel title="Notes">
        <NotesField value={progress.notes ?? ''} onSave={(notes) => run('character.setNotes', { notes })} />
      </Panel>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => confirm('Set this character aside? It can be brought back later.') && run('character.setAside')}>
            Set aside
          </button>
          <button className="btn btn-danger" onClick={() => confirm(`Retire ${character.title || characterName(character)}?`) && run('character.retire')}>
            Retire
          </button>
        </div>
      )}
    </div>
  );
}

function TitleInput({ value, disabled, onSave }: { value: string; disabled: boolean; onSave(value: string): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input className="input w-48 py-1" value={draft} disabled={disabled} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== value && onSave(draft)} />
  );
}

function PersonalQuest({ character, canEdit, run }: { character: Character; canEdit: boolean; run: (type: string, payload?: object) => void }) {
  const progress = character.progress;
  const pq = progress.personalQuest ? gameManager.personalQuestManager.personalQuestByCard('fh', progress.personalQuest) : undefined;
  const [cardId, setCardId] = useState('');
  return (
    <div className="text-sm">
      {pq ? (
        <>
          <div className="mb-2 font-medium">
            {labelText(`data.personalQuest.${pq.edition}.${pq.cardId}`)}{' '}
            <span className="text-frost-400">#{pq.cardId}</span>
          </div>
          <ul className="grid gap-1.5">
            {pq.requirements.map((requirement, index) => (
              <li key={index} className="flex items-center justify-between gap-2">
                <span className="text-frost-300">{ghsText(requirement.name)}</span>
                <Stepper
                  value={progress.personalQuestProgress[index] ?? 0}
                  max={9999}
                  disabled={!canEdit}
                  width="w-12"
                  onChange={(value) => run('character.setPersonalQuestProgress', { index, value })}
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-2 text-frost-400">No personal quest recorded.</p>
      )}
      {canEdit && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run('character.setPersonalQuest', { cardId });
            setCardId('');
          }}
        >
          <input className="input" placeholder="Card number, e.g. 581" value={cardId} onChange={(e) => setCardId(e.target.value)} />
          <button className="btn" disabled={!cardId}>
            Set
          </button>
        </form>
      )}
    </div>
  );
}

function Items({ character, canEdit, run }: { character: Character; canEdit: boolean; run: (type: string, payload?: object) => void }) {
  const [id, setId] = useState('');
  const items = character.progress.items
    .map((identifier) => gameManager.itemManager.getItem(identifier.name, identifier.edition, true))
    .filter((item) => !!item);
  return (
    <div className="text-sm">
      {items.length === 0 && <p className="text-frost-400">No items.</p>}
      <ul className="grid gap-1">
        {items.map((item) => {
          const equipped = character.progress.equippedItems.some((e) => e.name === '' + item.id && e.edition === item.edition);
          return (
            <li key={`${item.edition}-${item.id}`} className="flex items-center gap-2">
              <span className="w-8 text-right font-mono text-frost-400">{item.id}</span>
              <span className={equipped ? '' : 'text-frost-400'}>{item.name}</span>
              {canEdit && (
                <span className="ml-auto flex gap-2 text-xs">
                  <button className="text-frost-400 hover:text-frost-100" onClick={() => run('character.toggleEquippedItem', { id: item.id, itemEdition: item.edition })}>
                    {equipped ? 'unequip' : 'equip'}
                  </button>
                  <button className="text-frost-400 hover:text-blood-400" onClick={() => run('character.removeItem', { id: item.id, itemEdition: item.edition })}>
                    remove
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run('character.addItem', { id, itemEdition: 'fh' });
            setId('');
          }}
        >
          <input className="input" placeholder="Item number" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} />
          <button className="btn" disabled={!id}>
            Add item
          </button>
        </form>
      )}
    </div>
  );
}

function RetiredPanel() {
  const { state, send } = useCampaign();
  const party = state!.ghs.party;
  if (!party.retirements.length && !party.availableCharacters.length) {
    return null;
  }
  return (
    <Panel title="Not in play">
      <ul className="grid gap-1 text-sm">
        {party.availableCharacters.map((c) => (
          <li key={`a-${c.edition}-${c.name}`} className="flex items-center justify-between gap-2">
            <span>{c.title || characterName(c)}</span>
            <button className="text-xs text-frost-400 hover:text-frost-100" onClick={() => send('character.bringBack', { edition: c.edition, name: c.name }).catch(() => {})}>
              bring back
            </button>
          </li>
        ))}
        {party.retirements.map((c) => (
          <li key={`r-${c.edition}-${c.name}`} className="flex items-center justify-between gap-2 text-frost-400">
            <span>
              {c.title || characterName(c)} <span className="text-xs">(retired)</span>
            </span>
            <button className="text-xs hover:text-frost-100" onClick={() => send('party.reactivateCharacter', { edition: c.edition, name: c.name }).catch(() => {})}>
              un-retire
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
