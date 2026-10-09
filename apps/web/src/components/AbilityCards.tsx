/** Ability card views shared by the character sheet and the online scenario hands. */
import { availableAbilityCards, handSize } from '@fh/engine';
import { Character, gameManager } from '@fh/ghs-core';
import type { AbilityCard } from '@fh/ghs-core/vendor/game/model/data/AbilityCard';
import { useState } from 'react';
import { assetUrl, slug, useImages, type ImageIndex } from '../lib/board-data';
import { Modal } from './ui';

function editionPrefix(edition: string) {
  return edition === 'gh' ? 'gh' : edition === 'jotl' ? 'jotl' : edition === 'fc' ? 'fc' : 'fh';
}

export function cardImage(images: ImageIndex | undefined, character: Character, card: AbilityCard | undefined) {
  if (!images || !card?.name) return undefined;
  return images.abilityCards[`${editionPrefix(character.edition)}:${slug(character.name)}`]?.[slug(card.name)];
}

/** A card in a pile. Without an onClick of its own, clicking a known card opens a larger view of it. */
export function CardView({
  image,
  card,
  selected,
  leading,
  muted,
  onClick
}: {
  image?: string;
  card?: AbilityCard;
  selected?: boolean;
  leading?: boolean;
  muted?: boolean;
  onClick?(): void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const zoomable = !onClick && !!card;
  return (
    <>
      <button
        className={`relative overflow-hidden rounded-lg border text-left ${selected ? 'border-ice-400 ring-2 ring-ice-400' : 'border-ink-600'} ${onClick || zoomable ? 'hover:border-ice-300' : 'cursor-default'} ${muted ? 'opacity-50' : ''}`}
        onClick={onClick ?? (zoomable ? () => setZoomed(true) : undefined)}
        title={card ? `${card.name} (${card.initiative})` : 'Hidden card'}
      >
        {image ? (
          <img src={assetUrl(image)} alt={card?.name} className="block w-full" loading="lazy" />
        ) : (
          <div className="grid aspect-[2/3] w-full place-items-center bg-ink-850 p-2 text-center text-xs">
            {card ? (
              <span>
                {card.name}
                <br />
                <span className="font-mono text-lg">{card.initiative}</span>
              </span>
            ) : (
              '?'
            )}
          </div>
        )}
        {leading && <span className="absolute left-1 top-1 rounded bg-ice-500 px-1 text-[10px] font-semibold text-ink-950">initiative</span>}
      </button>
      {zoomed && card && (
        <Modal title={`${card.name} (${card.initiative})`} onClose={() => setZoomed(false)}>
          {image ? (
            <img src={assetUrl(image)} alt={card.name} className="mx-auto block max-h-[75vh] w-auto rounded-lg" />
          ) : (
            <p className="text-sm text-frost-400">No card image available.</p>
          )}
        </Modal>
      )}
    </>
  );
}

/** Card grid for deck building: cards at least 200px wide so their small print is readable. */
export const DECK_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(min(200px,45%),1fr))] gap-3';

/**
 * The cards in a deck and the character's other unlocked cards. Clicking a
 * deck card takes it out, clicking another card puts it in while there's room.
 */
export function DeckEditor({ character, cards, onChange, disabled }: { character: Character; cards: number[]; onChange(cards: number[]): void; disabled?: boolean }) {
  const images = useImages();
  const available = availableAbilityCards({ gm: gameManager }, character);
  const size = handSize({ gm: gameManager }, character);
  const deck = available.filter((a) => cards.includes(a.cardId!));
  const others = available.filter((a) => !cards.includes(a.cardId!));
  const full = size > 0 && cards.length >= size;
  return (
    <div className="grid gap-3">
      <div>
        <div className="mb-1 flex items-baseline gap-2">
          <span className="label">
            In the deck · {cards.length}/{size}
          </span>
          {!disabled && deck.length > 0 && <span className="text-xs text-frost-400">click a card to take it out</span>}
        </div>
        {deck.length ? (
          <div className={DECK_GRID}>
            {deck.map((a) => (
              <CardView key={a.cardId} card={a} image={cardImage(images, character, a)} onClick={disabled ? undefined : () => onChange(cards.filter((id) => id !== a.cardId))} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-frost-400">No cards yet.</p>
        )}
      </div>
      {others.length > 0 && (
        <div>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="label">Other unlocked cards</span>
            {!disabled && <span className="text-xs text-frost-400">{full ? 'take a card out to make room' : 'click a card to add it'}</span>}
          </div>
          <div className={DECK_GRID}>
            {others.map((a) => (
              <CardView
                key={a.cardId}
                card={a}
                image={cardImage(images, character, a)}
                muted={disabled || full}
                onClick={disabled || full ? undefined : () => onChange([...cards, a.cardId!])}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
