/**
 * Port of GHS src/app/ui/figures/event/distribution/event-distribution-dialog.ts
 * (AGPL-3.0): who receives or pays an event's collective gold, resources,
 * experience and items.
 */
import { characterKey, effectText, type EventFollowUp } from '@fh/engine';
import { Character, gameManager, labelText } from '@fh/ghs-core';
import { EventCardEffectType, type EventCardEffect } from '@fh/ghs-core/vendor/game/model/data/EventCard';
import type { ItemData } from '@fh/ghs-core/vendor/game/model/data/ItemData';
import { herbResourceLootTypes, materialResourceLootTypes, resourceLootTypes, type LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { useMemo, useState } from 'react';
import { useCampaign } from '../lib/campaign-store';
import { Modal } from './ui';

type ValueType = 'gold' | 'experience' | LootType;
interface Entry {
  type: ValueType;
  total: number;
}
interface ItemEntry {
  item: ItemData;
}
interface ConsumeEntry {
  slot: string | undefined;
  count: number;
}

function categoryTypes(category: string): LootType[] {
  if (category === 'material_resources' || category === 'material-resource') return materialResourceLootTypes;
  if (category === 'herb_resources' || category === 'herb-resource') return herbResourceLootTypes;
  return resourceLootTypes;
}

/** GHS buildEntries. */
function buildEntries(effects: EventCardEffect[], edition: string) {
  const receive: Entry[] = [];
  const spend: Entry[] = [];
  const itemsReceive: ItemEntry[] = [];
  const itemsLose: ItemEntry[] = [];
  const consume: ConsumeEntry[] = [];
  const manual: EventCardEffect[] = [];
  let receiveGlobal: number | undefined;
  let spendGlobal: number | undefined;
  const add = (list: Entry[], type: ValueType, value: number) => {
    const entry = list.find((e) => e.type === type);
    if (entry) entry.total += value;
    else list.push({ type, total: value });
  };
  for (const effect of effects) {
    const v = effect.values ?? [];
    switch (effect.type) {
      case EventCardEffectType.itemCollective:
      case EventCardEffectType.item:
      case EventCardEffectType.collectiveItem: {
        const collective = effect.type === EventCardEffectType.itemCollective;
        const item = gameManager.itemManager.getItem(v[0] as number, (v[collective ? 2 : 1] as string) || edition, true);
        if (!item) manual.push(effect);
        else for (let i = 0; i < (collective ? +v[1]! : 1); i++) itemsReceive.push({ item });
        break;
      }
      case EventCardEffectType.loseItem: {
        const item = gameManager.itemManager.getItem(v[0] as number, (v[1] as string) || edition, true);
        if (item) itemsLose.push({ item });
        else manual.push(effect);
        break;
      }
      case EventCardEffectType.consumeItem:
      case EventCardEffectType.consumeCollectiveItem:
        consume.push({ slot: v[1] as string | undefined, count: +v[0]! });
        break;
      case EventCardEffectType.collectiveGold:
      case EventCardEffectType.collectiveGoldAdditional:
      case EventCardEffectType.collectiveGoldOther:
        add(receive, 'gold', +v[0]!);
        break;
      case EventCardEffectType.collectiveResource:
        add(receive, v[1] as LootType, +v[0]!);
        break;
      case EventCardEffectType.collectiveResourceType:
        categoryTypes(v[1] as string).forEach((type) => add(receive, type, 0));
        receiveGlobal = (receiveGlobal ?? 0) + +v[0]!;
        break;
      case EventCardEffectType.loseCollectiveExperience:
        add(spend, 'experience', +v[0]!);
        break;
      case EventCardEffectType.loseCollectiveGold:
        add(spend, 'gold', +v[0]!);
        break;
      case EventCardEffectType.loseCollectiveResource:
        add(spend, v[1] as LootType, +v[0]!);
        break;
      case EventCardEffectType.loseCollectiveResourceAny:
        resourceLootTypes.forEach((type) => add(spend, type, 0));
        spendGlobal = (spendGlobal ?? 0) + +v[0]!;
        break;
      case EventCardEffectType.loseCollectiveResourceType:
        categoryTypes(v[1] as string).forEach((type) => add(spend, type, 0));
        spendGlobal = (spendGlobal ?? 0) + +v[0]!;
        break;
      default:
        manual.push(effect);
    }
  }
  return { receive, spend, itemsReceive, itemsLose, consume, manual, receiveGlobal, spendGlobal };
}

const typeName = (type: ValueType) => (type === 'gold' ? 'Gold' : type === 'experience' ? 'XP' : labelText('game.loot.' + type));
const itemName = (item: ItemData) => `${item.id} ${labelText(`data.items.${item.edition}-${item.id}`)}`;

export function DistributionDialog({ followUp, index, onClose }: { followUp: EventFollowUp; index: number; onClose(): void }) {
  const { send } = useCampaign();
  const characters = gameManager.game.figures.filter((f): f is Character => f instanceof Character);
  const entries = useMemo(() => buildEntries(followUp.distribution, followUp.edition), [followUp]);
  const [receive, setReceive] = useState<Record<string, Record<string, number>>>({});
  const [spend, setSpend] = useState<Record<string, Record<string, number>>>({});
  const [itemsReceive, setItemsReceive] = useState<string[]>(entries.itemsReceive.map(() => ''));
  const [itemsLose, setItemsLose] = useState<string[]>(entries.itemsLose.map(() => ''));
  const [consume, setConsume] = useState<{ character: string; id: string; edition: string }[][]>(entries.consume.map(() => []));

  const sum = (values: Record<string, Record<string, number>>, type: string) => Object.values(values).reduce((total, v) => total + (v[type] ?? 0), 0);
  const set = (setter: typeof setReceive, who: string, type: string, value: number) =>
    setter((current) => ({ ...current, [who]: { ...current[who], [type]: Math.max(0, value) } }));

  const receiveDone = entries.receiveGlobal
    ? entries.receive.reduce((t, e) => t + sum(receive, e.type), 0) >= entries.receiveGlobal
    : entries.receive.every((e) => sum(receive, e.type) >= e.total);
  const spendDone = entries.spendGlobal
    ? entries.spend.filter((e) => e.type !== 'gold' && e.type !== 'experience').reduce((t, e) => t + sum(spend, e.type), 0) >= entries.spendGlobal &&
      entries.spend.filter((e) => e.type === 'gold' || e.type === 'experience').every((e) => sum(spend, e.type) >= e.total)
    : entries.spend.every((e) => sum(spend, e.type) >= e.total);
  const complete =
    receiveDone &&
    spendDone &&
    itemsReceive.every(Boolean) &&
    itemsLose.every(Boolean) &&
    entries.consume.every((entry, i) => (consume[i]?.length ?? 0) >= entry.count);

  const apply = () => {
    if (!complete && !confirm('Not everything is distributed yet. Apply anyway?')) return;
    const flatten = (values: Record<string, Record<string, number>>, party: boolean) =>
      Object.entries(values).flatMap(([who, types]) =>
        Object.entries(types)
          .filter(([, amount]) => amount > 0)
          .map(([type, amount]) => ({ ...(party && who === 'party' ? {} : { character: who }), type, amount }))
      );
    const itemRef = (character: string, item: ItemData) => ({ character, id: item.id, edition: item.edition });
    send('eventFollowUp.distribute', {
      index,
      gains: flatten(receive, false),
      losses: flatten(spend, true),
      addItems: entries.itemsReceive.flatMap((e, i) => (itemsReceive[i] ? [itemRef(itemsReceive[i]!, e.item)] : [])),
      removeItems: entries.itemsLose.flatMap((e, i) => (itemsLose[i] ? [itemRef(itemsLose[i]!, e.item)] : [])),
      consumeItems: consume.flat()
    })
      .then(onClose)
      .catch(() => {});
  };

  const grid = (list: Entry[], values: Record<string, Record<string, number>>, setter: typeof setReceive, withParty: boolean) => (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-frost-400">
        <tr>
          <th className="pb-1 font-normal" />
          {characters.map((c) => (
            <th key={c.name} className="pb-1 font-normal">
              {gameManager.characterManager.characterName(c)}
            </th>
          ))}
          {withParty && <th className="pb-1 font-normal">Outpost</th>}
          <th className="pb-1 font-normal" />
        </tr>
      </thead>
      <tbody>
        {list.map((entry) => {
          const isResource = entry.type !== 'gold' && entry.type !== 'experience';
          const owners = [...characters.map((c) => characterKey(c)), ...(withParty && isResource ? ['party'] : [])];
          return (
            <tr key={entry.type} className="border-t border-ink-700">
              <td className="py-1 pr-2">{typeName(entry.type)}</td>
              {owners.map((who) => (
                <td key={who} className="py-1 pr-2">
                  <input
                    className="input w-14 py-0.5"
                    inputMode="numeric"
                    value={values[who]?.[entry.type] ?? 0}
                    onChange={(e) => set(setter, who, entry.type, Number(e.target.value) || 0)}
                  />
                </td>
              ))}
              {withParty && !isResource && <td />}
              <td className="py-1 text-xs text-frost-400">{entry.total ? `${sum(values, entry.type)}/${entry.total}` : sum(values, entry.type)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const characterSelect = (value: string, onChange: (value: string) => void, allowed: (c: Character) => boolean) => (
    <select className="input w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Who?</option>
      {characters.filter(allowed).map((c) => (
        <option key={c.name} value={characterKey(c)}>
          {gameManager.characterManager.characterName(c)}
        </option>
      ))}
    </select>
  );

  return (
    <Modal wide title="Distribute event effects" onClose={onClose}>
      <div className="grid gap-5">
        {entries.receive.length > 0 && (
          <section>
            <div className="label mb-1">Receive{entries.receiveGlobal ? ` ${entries.receiveGlobal} in total` : ''}</div>
            {grid(entries.receive, receive, setReceive, false)}
          </section>
        )}
        {entries.spend.length > 0 && (
          <section>
            <div className="label mb-1">Pay{entries.spendGlobal ? ` ${entries.spendGlobal} resources in total` : ''}</div>
            {grid(entries.spend, spend, setSpend, true)}
          </section>
        )}
        {entries.itemsReceive.map((entry, i) => (
          <label key={`r${i}`} className="flex flex-wrap items-center gap-2 text-sm">
            <span>Receive item {itemName(entry.item)}</span>
            {characterSelect(itemsReceive[i] ?? '', (v) => setItemsReceive(itemsReceive.map((x, j) => (j === i ? v : x))), (c) =>
              gameManager.itemManager.canAdd(entry.item, c)
            )}
          </label>
        ))}
        {entries.itemsLose.map((entry, i) => (
          <label key={`l${i}`} className="flex flex-wrap items-center gap-2 text-sm">
            <span>Lose item {itemName(entry.item)}</span>
            {characterSelect(itemsLose[i] ?? '', (v) => setItemsLose(itemsLose.map((x, j) => (j === i ? v : x))), (c) =>
              gameManager.itemManager.owned(entry.item, c)
            )}
          </label>
        ))}
        {entries.consume.map((entry, i) => (
          <section key={`c${i}`} className="text-sm">
            <div className="label mb-1">
              Consume {entry.count} {entry.slot ? labelText('game.itemSlot.' + entry.slot) : ''} item{entry.count === 1 ? '' : 's'} ({consume[i]?.length ?? 0}/
              {entry.count})
            </div>
            <div className="grid gap-1">
              {characters.map((c) => {
                const items = c.progress.items
                  .map((id) => gameManager.itemManager.getItem(id.name, id.edition, true))
                  .filter((item): item is ItemData => !!item && (!entry.slot || item.slot === entry.slot));
                return (
                  <div key={c.name} className="flex flex-wrap items-center gap-2">
                    <span className="w-28 text-frost-300">{gameManager.characterManager.characterName(c)}</span>
                    {items.length === 0 && <span className="text-xs text-frost-400">no matching items</span>}
                    {items.map((item) => {
                      const ref = { character: characterKey(c), id: String(item.id), edition: item.edition };
                      const selected = consume[i]?.some((x) => x.character === ref.character && x.id === ref.id) ?? false;
                      return (
                        <label key={item.id} className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              setConsume(
                                consume.map((list, j) =>
                                  j !== i ? list : selected ? list.filter((x) => !(x.character === ref.character && x.id === ref.id)) : [...list, ref]
                                )
                              )
                            }
                          />
                          {itemName(item)}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {entries.manual.length > 0 && (
          <section className="text-sm">
            <div className="label mb-1">Apply by hand</div>
            {entries.manual.map((effect, i) => (
              <p key={i}>• {effectText(effect, followUp.edition)}</p>
            ))}
          </section>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={apply}>
          Apply
        </button>
      </div>
    </Modal>
  );
}
