import { gameManager } from '@fh/ghs-core';
import { AddInput, Chip, Panel } from '../../components/ui';
import { useCampaign } from '../../lib/campaign-store';
import { buildingName } from '../../lib/labels';

const STATE_STYLE: Record<string, string> = {
  normal: 'text-moss-400',
  damaged: 'text-ember-400',
  wrecked: 'text-blood-400'
};

export function OutpostTab() {
  const { state, send } = useCampaign();
  const party = state!.ghs.party;
  const run = (type: string, payload: unknown) => send(type, payload).catch(() => {});
  const buildingData = gameManager.campaignManager.campaignData().buildings ?? [];
  const built = [...party.buildings].sort((a, b) => {
    const ia = buildingData.find((d) => d.name === a.name)?.id ?? '';
    const ib = buildingData.find((d) => d.name === b.name)?.id ?? '';
    return ia.localeCompare(ib, undefined, { numeric: true });
  });
  const notBuilt = buildingData.filter((d) => !party.buildings.some((b) => b.name === d.name));

  const items = party.unlockedItems
    .map((identifier) => ({ identifier, item: gameManager.itemManager.getItem(identifier.name, identifier.edition, true) }))
    .filter((x): x is { identifier: (typeof party.unlockedItems)[number]; item: NonNullable<typeof x.item> } => !!x.item)
    .sort((a, b) => Number(a.item.id) - Number(b.item.id));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={`Buildings (${built.length})`}>
        <table className="w-full text-sm">
          <tbody>
            {built.map((b) => {
              const data = buildingData.find((d) => d.name === b.name);
              const maxLevel = (data?.upgrades?.length ?? 0) + 1;
              return (
                <tr key={b.name} className="border-b border-ink-700 last:border-0">
                  <td className="py-1.5 pr-2 font-mono text-frost-400">{data?.id}</td>
                  <td className="py-1.5">{buildingName(b.name)}</td>
                  <td className="py-1.5 text-frost-300">{b.level === 0 ? 'not built' : `level ${b.level}`}</td>
                  <td className="py-1.5">
                    {data?.repair && b.level > 0 ? (
                      <select
                        className={`bg-transparent text-xs ${STATE_STYLE[b.state]}`}
                        value={b.state}
                        onChange={(e) => run('building.setState', { name: b.name, state: e.target.value })}
                      >
                        <option value="normal">normal</option>
                        <option value="damaged">damaged</option>
                        <option value="wrecked">wrecked</option>
                      </select>
                    ) : null}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <button className="btn h-7 px-2" title="Downgrade" onClick={() => run('building.downgrade', { name: b.name })}>
                      −
                    </button>{' '}
                    <button className="btn h-7 px-2" title="Upgrade (already paid)" disabled={b.level >= maxLevel} onClick={() => run('building.upgrade', { name: b.name })}>
                      +
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {notBuilt.length > 0 && (
          <div className="mt-3">
            <AddInput
              placeholder="Add building…"
              options={notBuilt.map((d) => ({ value: d.name, label: `${d.id} ${buildingName(d.name)}` }))}
              onAdd={(name) => run('building.add', { name })}
            />
          </div>
        )}
        <p className="mt-2 text-xs text-frost-400">Upgrades here record what's on the outpost map; paying costs happens in the outpost phase.</p>
      </Panel>

      <Panel title={`Item supply (${items.length})`}>
        <ul className="grid max-h-[28rem] gap-1 overflow-y-auto text-sm">
          {items.map(({ identifier, item }) => {
            const total = item.count;
            const available = identifier.count < 0 ? total : identifier.count;
            return (
              <li key={`${item.edition}-${item.id}`} className="flex items-center gap-2">
                <span className="w-8 text-right font-mono text-frost-400">{item.id}</span>
                <span className="flex-1">{item.name}</span>
                <span className="text-xs text-frost-400">
                  {available}/{total}
                </span>
                <select
                  className="bg-transparent text-xs text-frost-300"
                  value={available}
                  onChange={(e) => run('party.setUnlockedItemCount', { id: item.id, edition: item.edition, count: Number(e.target.value) })}
                  aria-label="Copies in supply"
                >
                  {Array.from({ length: total + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button className="text-xs text-frost-400 hover:text-blood-400" onClick={() => run('party.removeUnlockedItem', { id: item.id, edition: item.edition })}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          <AddInput placeholder="Unlock item #" buttonLabel="Unlock" onAdd={(id) => run('party.addUnlockedItem', { id })} />
        </div>
      </Panel>

      <Panel title={`Treasures looted (${party.treasures.length})`}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[...party.treasures]
            .sort((a, b) => +a.name - +b.name)
            .map((t) => (
              <Chip key={`${t.edition}-${t.name}`} onRemove={() => run('party.removeTreasure', { treasure: t.name, edition: t.edition })}>
                {t.name}
              </Chip>
            ))}
        </div>
        <AddInput placeholder="Treasure #" onAdd={(treasure) => run('party.addTreasure', { treasure })} />
      </Panel>
    </div>
  );
}
