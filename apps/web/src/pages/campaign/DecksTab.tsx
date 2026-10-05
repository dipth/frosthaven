import { gameManager } from '@fh/ghs-core';
import { useState } from 'react';
import { AddInput, Panel } from '../../components/ui';
import { useCampaign } from '../../lib/campaign-store';
import { eventCardName, eventDeckName } from '../../lib/labels';

/** Keeps the app's event decks in step with the physical decks in the box. */
export function DecksTab() {
  const { state, send } = useCampaign();
  const party = state!.ghs.party;
  const types = gameManager.eventCardManager.getEventTypesForEdition('fh');
  const [type, setType] = useState(types[0] ?? 'summer-road');
  const run = (command: string, payload: object = {}) => send(command, { type, ...payload }).catch(() => {});

  const deck = party.eventDecks[type] ?? [];
  const all = gameManager.eventCardManager.getEventCardsForEdition('fh', type);
  const drawn = party.eventCards.filter((c) => c.type === type);
  const outside = all.filter((card) => !deck.includes(card.cardId));

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Panel title="Decks">
        <ul className="grid gap-1">
          {types.map((t) => (
            <li key={t}>
              <button onClick={() => setType(t)} className={`w-full rounded-lg px-3 py-1.5 text-left text-sm ${t === type ? 'bg-ink-700' : 'hover:bg-ink-850'}`}>
                {eventDeckName(t)} <span className="text-frost-400">({party.eventDecks[t]?.length ?? 0})</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid gap-4">
        <Panel
          title={`${eventDeckName(type)} deck · ${deck.length} cards`}
          actions={
            <>
              {deck.length === 0 && (
                <button className="btn btn-primary" onClick={() => run('events.buildDeck')}>
                  Build starting deck
                </button>
              )}
              <button className="btn" disabled={deck.length < 2} onClick={() => run('events.shuffle')}>
                Shuffle
              </button>
              <button className="btn btn-danger" disabled={deck.length === 0} onClick={() => confirm('Empty this deck?') && run('events.reset')}>
                Reset
              </button>
            </>
          }
        >
          <p className="mb-3 text-sm text-frost-400">
            Make this match the physical deck: same cards in it. Order only matters if you keep the physical deck in a known order; otherwise shuffle both.
          </p>
          <ol className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-4 lg:grid-cols-6">
            {deck.map((cardId, index) => (
              <li key={cardId} className="group flex items-center justify-between rounded-md border border-ink-600 bg-ink-850 px-2 py-1">
                <span>
                  <span className="mr-1 text-xs text-frost-400">{index + 1}.</span>
                  {eventCardName(type, cardId)}
                </span>
                <button className="text-frost-400 opacity-0 group-hover:opacity-100 hover:text-blood-400" title="Remove from deck" onClick={() => run('events.removeCard', { cardId })}>
                  ×
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            <AddInput
              placeholder="Add card to deck…"
              options={outside.map((c) => ({ value: c.cardId, label: eventCardName(type, c.cardId) }))}
              onAdd={(cardId) => run('events.addCard', { cardId: cardId.toUpperCase() })}
            />
          </div>
        </Panel>
        {drawn.length > 0 && (
          <Panel title="Drawn this campaign">
            <ul className="flex flex-wrap gap-1.5 text-sm">
              {drawn.map((c) => (
                <li key={c.cardId} className="rounded-md border border-ink-600 px-2 py-0.5 text-frost-300">
                  {eventCardName(type, c.cardId)}
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
