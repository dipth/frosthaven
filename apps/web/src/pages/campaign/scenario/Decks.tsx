import { Character, gameManager, GameState, labelText } from '@fh/ghs-core';
import type { AttackModifierDeck } from '@fh/ghs-core/vendor/game/model/data/AttackModifier';
import { Element, ElementState } from '@fh/ghs-core/vendor/game/model/data/Element';
import { useState } from 'react';
import { useCampaign } from '../../../lib/campaign-store';
import { amText, amTone, lootText } from './helpers';

type DeckRef = 'monster' | 'ally' | { kind: 'character'; edition: string; name: string };

export function AmDeck({ deck: ref, attackModifierDeck: deck, title }: { deck: DeckRef; attackModifierDeck: AttackModifierDeck; title?: string }) {
  const { send } = useCampaign();
  const run = (type: string, payload: object = {}) => send(type, { deck: ref, ...payload }).catch(() => {});
  const visible = deck.current >= 0 ? deck.cards.slice(Math.max(0, deck.lastVisible), deck.current + 1) : [];
  const remaining = deck.cards.length - deck.current - 1;
  const upcoming = (type: string) => deck.cards.filter((am, i) => am.type === type && i > deck.current).length;
  const needsShuffle = deck.cards.slice(0, deck.current + 1).some((am) => am.shuffle);
  const canDraw = gameManager.game.state === GameState.next;

  return (
    <div className="rounded-lg border border-ink-600 bg-ink-850 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm">
        {title && <span className="font-medium">{title}</span>}
        <span className="text-xs text-frost-400">
          {remaining} left{needsShuffle ? ' · shuffle at round end' : ''}
        </span>
      </div>
      <div className="mb-2 flex min-h-10 flex-wrap items-center gap-2">
        {visible.length === 0 && <span className="text-sm text-frost-400">No card drawn</span>}
        {visible.map((am, i) => (
          <span
            key={i}
            className={`rounded-md border border-ink-500 bg-ink-950 px-3 py-1.5 font-mono text-lg ${amTone(am)} ${visible.length > 1 && i < visible.length - 1 ? 'opacity-60' : ''}`}
          >
            {amText(am)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button className="btn btn-primary" disabled={!canDraw} onClick={() => run('am.draw')}>
          Draw
        </button>
        <button className="btn" disabled={!canDraw} onClick={() => run('am.draw', { state: 'advantage' })}>
          Advantage
        </button>
        <button className="btn" disabled={!canDraw} onClick={() => run('am.draw', { state: 'disadvantage' })}>
          Disadvantage
        </button>
        <button className="btn" onClick={() => run('am.shuffle')}>
          Shuffle
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-frost-300">
        {(['bless', 'curse'] as const).map((type) => (
          <span key={type} className="flex items-center gap-1">
            {labelText('game.condition.' + type)} {upcoming(type)}
            <button className="btn h-6 w-6 p-0" onClick={() => run('am.changeCount', { type, delta: -1 })}>
              −
            </button>
            <button className="btn h-6 w-6 p-0" onClick={() => run('am.changeCount', { type, delta: 1 })}>
              +
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function LootDeck() {
  const { send } = useCampaign();
  const deck = gameManager.game.lootDeck;
  const characters = gameManager.game.figures.filter((f): f is Character => f instanceof Character && !f.absent);
  const active = characters.find((c) => c.active);
  const [target, setTarget] = useState<string>('');
  if (!deck.cards.length) {
    return null;
  }
  const drawn = deck.cards.slice(0, deck.current + 1).map((card, index) => ({ card, index, owner: characters.find((c) => c.lootCards.includes(index)) }));
  const chosen = characters.find((c) => `${c.edition}:${c.name}` === target) ?? active;

  return (
    <div className="rounded-lg border border-ink-600 bg-ink-850 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="font-medium">Loot deck</span>
        <span className="text-xs text-frost-400">{deck.cards.length - deck.current - 1} left</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto py-1 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">{active ? `Active: ${gameManager.characterManager.characterName(active)}` : 'Choose character…'}</option>
          {characters.map((c) => (
            <option key={c.name} value={`${c.edition}:${c.name}`}>
              {gameManager.characterManager.characterName(c)}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          disabled={!chosen || deck.current + 1 >= deck.cards.length}
          onClick={() => chosen && send('loot.draw', { character: { edition: chosen.edition, name: chosen.name } }).catch(() => {})}
        >
          Loot
        </button>
      </div>
      {drawn.length > 0 && (
        <ul className="mt-2 grid gap-1 text-xs">
          {[...drawn].reverse().map(({ card, index, owner }) => (
            <li key={index} className="flex items-center justify-between gap-2">
              <span>{lootText(card)}</span>
              <select
                className="bg-transparent text-frost-400"
                value={owner ? `${owner.edition}:${owner.name}` : ''}
                onChange={(e) => {
                  const [edition, name] = e.target.value.split(':');
                  if (edition && name) send('loot.assign', { index, character: { edition, name } }).catch(() => {});
                }}
              >
                <option value="">unassigned</option>
                {characters.map((c) => (
                  <option key={c.name} value={`${c.edition}:${c.name}`}>
                    {gameManager.characterManager.characterName(c)}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ELEMENTS = [Element.fire, Element.ice, Element.air, Element.earth, Element.light, Element.dark];
const ELEMENT_COLOR: Record<string, string> = {
  fire: '#ff7a45',
  ice: '#7cd4ff',
  air: '#c5d3e0',
  earth: '#8fdc6a',
  light: '#ffd94a',
  dark: '#a77cff'
};

export function ElementBoard() {
  const { send } = useCampaign();
  return (
    <div className="flex gap-1.5">
      {ELEMENTS.map((type) => {
        const element = gameManager.game.elementBoard.find((e) => e.type === type);
        const state = element?.state ?? ElementState.inert;
        const strong = state === ElementState.strong || state === ElementState.new;
        const waning = state === ElementState.waning;
        return (
          <button
            key={type}
            title={`${labelText('game.element.' + type)}: ${labelText('game.element.state.' + state)} (click to cycle)`}
            onClick={() => send('element.set', { element: type }).catch(() => {})}
            className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-ink-500 text-[10px] font-semibold uppercase"
            style={{
              background: strong ? ELEMENT_COLOR[type] : waning ? `linear-gradient(to top, ${ELEMENT_COLOR[type]} 50%, transparent 50%)` : 'transparent',
              color: strong ? '#0b1220' : ELEMENT_COLOR[type]
            }}
          >
            {type.slice(0, 2)}
          </button>
        );
      })}
    </div>
  );
}
