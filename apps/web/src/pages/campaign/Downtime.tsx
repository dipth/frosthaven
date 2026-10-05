/**
 * Downtime for one character: shop (buy/craft), brewing, enhancing, card
 * picks at level-up and donations. After GHS items dialog, brew dialog,
 * ability cards dialog and enhancements (AGPL-3.0).
 */
import {
  BREW_HERBS,
  brewingHerbs,
  brewResult,
  cardsToPick,
  characterKey,
  enhancementCost,
  suggestedHerbSpend,
  type EnhancementSpec
} from '@fh/engine';
import { Character, gameManager, labelText } from '@fh/ghs-core';
import { ActionType } from '@fh/ghs-core/vendor/game/model/data/Action';
import type { ItemData } from '@fh/ghs-core/vendor/game/model/data/ItemData';
import type { LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { useState } from 'react';
import { Panel } from '../../components/ui';
import { useCampaign } from '../../lib/campaign-store';

type Run = (type: string, payload?: object) => void;

export function Downtime({ character, canEdit, run }: { character: Character; canEdit: boolean; run: Run }) {
  const [tab, setTab] = useState<'shop' | 'brew' | 'enhance' | 'cards'>('shop');
  const picks = cardsToPick(character);
  const temple = gameManager.game.party.buildings.some((b) => b.name === 'temple' && b.level && b.state !== 'wrecked');
  return (
    <Panel
      title="Downtime"
      actions={
        <div className="flex flex-wrap gap-1">
          {(['shop', 'brew', 'enhance', 'cards'] as const).map((t) => (
            <button key={t} className={`btn px-2 py-1 text-xs ${tab === t ? 'border-ice-400' : ''}`} onClick={() => setTab(t)}>
              {t === 'cards' ? `Cards${picks.count ? ` (${picks.count} to pick)` : ''}` : t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      }
    >
      {!canEdit && <p className="mb-2 text-xs text-frost-400">This character belongs to another player.</p>}
      {tab === 'shop' && <Shop character={character} canEdit={canEdit} run={run} />}
      {tab === 'brew' && <Brew character={character} canEdit={canEdit} />}
      {tab === 'enhance' && <Enhance character={character} canEdit={canEdit} run={run} />}
      {tab === 'cards' && <Cards character={character} canEdit={canEdit} run={run} />}
      {temple && (
        <div className="mt-4 flex items-center gap-2 border-t border-ink-700 pt-3 text-sm">
          <span className="text-frost-300">Temple donations: {character.progress.donations}</span>
          <button className="btn ml-auto px-2 py-1 text-xs" disabled={!canEdit || character.progress.gold < 5} onClick={() => run('character.donate')}>
            Donate 5 gold
          </button>
        </div>
      )}
    </Panel>
  );
}

function costText(item: ItemData): string {
  const parts: string[] = [];
  if (item.cost) parts.push(`${item.cost + gameManager.itemManager.pricerModifier()}g`);
  if (item.resources) {
    for (const [type, value] of Object.entries(item.resources)) if (value) parts.push(`${value} ${labelText('game.loot.' + type).toLowerCase()}`);
  }
  if (item.resourcesAny?.length) parts.push(`${item.resourcesAny.length} any herb`);
  if (item.requiredItems?.length) parts.push(`items ${item.requiredItems.join(', ')}`);
  return parts.join(', ');
}

function Shop({ character, canEdit, run }: { character: Character; canEdit: boolean; run: Run }) {
  const [filter, setFilter] = useState('');
  const im = gameManager.itemManager;
  const supply = im
    .getItems(gameManager.currentEdition(), false)
    .filter((item) => item.requiredBuilding !== 'alchemist' && im.countAvailable(item) > 0)
    .filter((item) => !filter || `${item.id} ${item.name}`.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => +a.id - +b.id);
  const owned = character.progress.items.map((id) => im.getItem(id.name, id.edition, true)).filter((item): item is ItemData => !!item);
  const buyDisabled = im.buyingDisabled() && !character.tags.includes('new-character');
  return (
    <div className="grid gap-4 text-sm">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="label">Item supply</span>
          <span className="text-xs text-frost-400">
            {character.progress.gold} gold{buyDisabled ? ' · buying needs a trading post' : ''}
            {im.craftingDisabled() ? ' · craftsman wrecked' : ''}
          </span>
          <input className="input ml-auto w-36 py-0.5" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <ul className="grid max-h-72 gap-0.5 overflow-y-auto">
          {supply.map((item) => {
            const canBuy = canEdit && !!item.cost && im.canBuy(item, character);
            const canCraft = canEdit && !item.cost && im.canCraft(item, character) && im.canAdd(item, character);
            return (
              <li key={`${item.edition}-${item.id}`} className="flex items-center gap-2">
                <span className="w-8 text-right font-mono text-frost-400">{item.id}</span>
                <span className="flex-1">{item.name}</span>
                <span className="text-xs text-frost-400">{costText(item)}</span>
                <span className="w-8 text-right text-xs text-frost-400">×{im.countAvailable(item)}</span>
                {item.cost ? (
                  <button className="btn px-2 py-0.5 text-xs" disabled={!canBuy} onClick={() => run('item.buy', { id: item.id, itemEdition: item.edition })}>
                    Buy
                  </button>
                ) : (
                  <button className="btn px-2 py-0.5 text-xs" disabled={!canCraft} onClick={() => run('item.craft', { id: item.id, itemEdition: item.edition })}>
                    Craft
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {owned.length > 0 && (
        <div>
          <div className="label mb-1">Sell</div>
          <ul className="grid gap-0.5">
            {owned.map((item) => {
              const value = im.itemSellValue(item);
              const distill = im.canDistill(item);
              return (
                <li key={`${item.edition}-${item.id}`} className="flex items-center gap-2">
                  <span className="w-8 text-right font-mono text-frost-400">{item.id}</span>
                  <span className="flex-1">{item.name}</span>
                  {distill && canEdit && <DistillButton item={item} run={run} />}
                  <button
                    className="btn px-2 py-0.5 text-xs"
                    disabled={!canEdit || !value}
                    onClick={() => confirm(`Sell ${item.name} for ${value} gold?`) && run('item.sell', { id: item.id, itemEdition: item.edition })}
                  >
                    Sell {value}g
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function DistillButton({ item, run }: { item: ItemData; run: Run }) {
  const herbs = item.resources ? (Object.keys(item.resources) as LootType[]) : BREW_HERBS;
  return (
    <select
      className="input w-auto py-0.5 text-xs"
      value=""
      onChange={(e) => e.target.value && run('item.distill', { id: item.id, itemEdition: item.edition, herb: e.target.value })}
    >
      <option value="">Distill into…</option>
      {herbs.map((herb) => (
        <option key={herb} value={herb}>
          {labelText('game.loot.' + herb)}
        </option>
      ))}
    </select>
  );
}

function Brew({ character, canEdit }: { character: Character; canEdit: boolean }) {
  const { send } = useCampaign();
  const count = brewingHerbs();
  const [recipe, setRecipe] = useState<(LootType | '')[]>(['', '', '']);
  const characters = gameManager.game.figures.filter((f): f is Character => f instanceof Character);
  const [recipient, setRecipient] = useState(characterKey(character));
  if (!count || gameManager.itemManager.brewingDisabled()) {
    return <p className="text-sm text-frost-400">Brewing needs a working alchemist.</p>;
  }
  const herbs = recipe.slice(0, count).filter((h): h is LootType => !!h);
  const complete = herbs.length === count;
  const potion = complete ? brewResult(herbs) : undefined;
  const known = potion && gameManager.game.party.unlockedItems.some((i) => i.name === '' + potion.id && i.edition === potion.edition);
  const spend = suggestedHerbSpend(herbs, character);
  const available = (herb: LootType) => (character.progress.loot[herb] || 0) + (gameManager.game.party.loot[herb] || 0);
  const enough = BREW_HERBS.every((herb) => herbs.filter((h) => h === herb).length <= available(herb));
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-frost-400">
        Brew with {count} herbs (yours first, then the outpost supply). Two of the same herb make the special potion; an unknown recipe adds the potion to the supply.
      </p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: count }, (_, i) => (
          <select key={i} className="input w-auto" value={recipe[i]} onChange={(e) => setRecipe(recipe.map((h, j) => (j === i ? (e.target.value as LootType) : h)))}>
            <option value="">Herb…</option>
            {BREW_HERBS.map((herb) => (
              <option key={herb} value={herb}>
                {labelText('game.loot.' + herb)} ({available(herb)})
              </option>
            ))}
          </select>
        ))}
      </div>
      {complete && (
        <div>
          {potion ? (
            <>
              Makes <b>{potion.name}</b> (item {potion.id}){!known && <span className="text-moss-400"> · new recipe</span>}
            </>
          ) : (
            <span className="text-ember-400">That recipe makes nothing.</span>
          )}
          {!enough && <span className="text-blood-400"> · not enough herbs</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-frost-300">For</span>
        <select className="input w-auto" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
          {characters.map((c) => (
            <option key={c.name} value={characterKey(c)}>
              {gameManager.characterManager.characterName(c)}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary ml-auto"
          disabled={!canEdit || !potion || !enough}
          onClick={() =>
            send('item.brew', { brewer: characterKey(character), recipient, recipe: herbs, spend })
              .then(() => setRecipe(['', '', '']))
              .catch(() => {})
          }
        >
          Brew
        </button>
      </div>
    </div>
  );
}

const PLUS1_BASES = [
  ActionType.move,
  ActionType.attack,
  ActionType.range,
  ActionType.target,
  ActionType.shield,
  ActionType.retaliate,
  ActionType.pierce,
  ActionType.heal,
  ActionType.push,
  ActionType.pull,
  ActionType.teleport
];
const CONDITIONS = ['poison', 'wound', 'muddle', 'immobilize', 'curse', 'strengthen', 'bless', 'regenerate', 'ward'];
const ELEMENTS = ['fire', 'ice', 'air', 'earth', 'light', 'dark', 'wild'];

function Enhance({ character, canEdit, run }: { character: Character; canEdit: boolean; run: Run }) {
  const abilities = gameManager.deckData(character).abilities;
  const cards = abilities.filter((a, i) => a.level === 1 || a.level === 'X' || character.progress.deck.includes(i));
  const [spec, setSpec] = useState<EnhancementSpec>({ cardId: cards[0]?.cardId ?? 0, half: 'top', enhancement: 'plus1', base: ActionType.attack });
  const set = (change: Partial<EnhancementSpec>) => setSpec({ ...spec, ...change });
  const cost = spec.cardId ? enhancementCost(character, spec) : 0;
  const enhancer = gameManager.enhancementsManager.enhancerLevel;
  const enhancements = character.progress.enhancements ?? [];
  const cardName = (cardId: number) => {
    const card = abilities.find((a) => a.cardId === cardId);
    return card ? `${card.name ?? ''} (${card.cardId})` : String(cardId);
  };
  return (
    <div className="grid gap-3 text-sm">
      {!enhancer && <p className="text-ember-400">Enhancing needs a working enhancer (you can still record existing stickers).</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1">
          <span className="label">Card</span>
          <select className="input" value={spec.cardId} onChange={(e) => set({ cardId: Number(e.target.value) })}>
            {cards.map((card) => (
              <option key={card.cardId} value={card.cardId}>
                {card.name} ({card.cardId}, level {card.level})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="label">Half</span>
          <select className="input" value={spec.half} onChange={(e) => set({ half: e.target.value as 'top' | 'bottom' })}>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="label">Enhancement</span>
          <select className="input" value={spec.enhancement} onChange={(e) => set({ enhancement: e.target.value as EnhancementSpec['enhancement'] })}>
            <option value="plus1">+1</option>
            <option value="hex">Area hex</option>
            <option value="jump">Jump</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {labelText('game.condition.' + c)}
              </option>
            ))}
            {ELEMENTS.map((e) => (
              <option key={e} value={e}>
                {labelText('game.element.' + e)}
              </option>
            ))}
          </select>
        </label>
        {spec.enhancement === 'plus1' && (
          <label className="grid gap-1">
            <span className="label">On ability</span>
            <select className="input" value={spec.base} onChange={(e) => set({ base: e.target.value as ActionType })}>
              {PLUS1_BASES.map((base) => (
                <option key={base} value={base}>
                  {labelText('game.action.' + base)}
                </option>
              ))}
            </select>
          </label>
        )}
        {spec.enhancement === 'hex' && (
          <label className="grid gap-1">
            <span className="label">Target hexes now</span>
            <input className="input" inputMode="numeric" value={spec.hexes ?? 1} onChange={(e) => set({ hexes: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
        )}
        <label className="grid gap-1">
          <span className="label">Card type</span>
          <select className="input" value={spec.special ?? ''} onChange={(e) => set({ special: (e.target.value || undefined) as EnhancementSpec['special'] })}>
            <option value="">Normal</option>
            <option value="lost">Lost</option>
            <option value="persistent">Persistent</option>
            <option value="summon">Summon stat</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end">
          <input type="checkbox" checked={spec.multiTarget ?? false} onChange={(e) => set({ multiTarget: e.target.checked })} />
          Targets multiple
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Cost <b>{cost}</b> gold <span className="text-frost-400">({character.progress.gold} available)</span>
        </span>
        <button className="btn ml-auto" disabled={!canEdit} title="Already on the physical card: record without paying" onClick={() => run('character.enhance', { ...spec, record: true })}>
          Record only
        </button>
        <button className="btn btn-primary" disabled={!canEdit || !enhancer || cost > character.progress.gold} onClick={() => run('character.enhance', spec)}>
          Enhance
        </button>
      </div>
      {enhancements.length > 0 && (
        <div>
          <div className="label mb-1">Enhancements</div>
          <ul className="grid gap-0.5">
            {enhancements.map((e, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="flex-1">
                  {cardName(e.cardId)} · {e.actionIndex.startsWith('bottom') ? 'bottom' : 'top'} · {e.action === 'plus1' ? '+1' : e.action}
                </span>
                {canEdit && (
                  <button className="text-xs text-frost-400 hover:text-blood-400" onClick={() => confirm('Remove this enhancement record?') && run('character.removeEnhancement', { index })}>
                    remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Cards({ character, canEdit, run }: { character: Character; canEdit: boolean; run: Run }) {
  const abilities = gameManager.deckData(character).abilities;
  const picks = cardsToPick(character);
  const picked = character.progress.deck.map((i) => abilities[i]).filter((a) => !!a);
  const choices = abilities.filter(
    (a, i) => typeof a.level === 'number' && a.level > 1 && a.level <= picks.maxLevel && !character.progress.deck.includes(i)
  );
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-frost-400">
        Level {character.level}: {picked.length} card{picked.length === 1 ? '' : 's'} added above level 1.
        {picks.count > 0 && ` Pick ${picks.count} more (level ${picks.maxLevel} or lower).`}
      </p>
      {picks.count > 0 && (
        <ul className="grid gap-1">
          {choices.map((card) => (
            <li key={card.cardId} className="flex items-center gap-2">
              <span className="w-10 text-xs text-frost-400">lvl {card.level}</span>
              <span className="flex-1">
                {card.name} <span className="text-frost-400">({card.cardId})</span>
              </span>
              <button className="btn px-2 py-0.5 text-xs" disabled={!canEdit} onClick={() => run('character.pickCard', { cardId: card.cardId })}>
                Add to deck
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 && (
        <div>
          <div className="label mb-1">Added cards</div>
          <ul className="grid gap-0.5">
            {picked.map((card) => (
              <li key={card!.cardId} className="flex items-center gap-2">
                <span className="w-10 text-xs text-frost-400">lvl {card!.level}</span>
                <span className="flex-1">{card!.name}</span>
                {canEdit && (
                  <button className="text-xs text-frost-400 hover:text-blood-400" onClick={() => run('character.unpickCard', { cardId: card!.cardId })}>
                    remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
