/** Online mode: a player's ability cards for their character(s). */
import { availableAbilityCards, cardSlots, characterKey, handSize, HIDDEN_CARD, type HandState } from '@fh/engine';
import { Character, gameManager, GameState, labelText } from '@fh/ghs-core';
import type { AbilityCard } from '@fh/ghs-core/vendor/game/model/data/AbilityCard';
import { useState } from 'react';
import { Modal, Panel } from '../../../components/ui';
import { assetUrl, slug, useImages, type ImageIndex } from '../../../lib/board-data';
import { useCampaign } from '../../../lib/campaign-store';
import { useMe } from '../../../lib/me';

function editionPrefix(edition: string) {
  return edition === 'gh' ? 'gh' : edition === 'jotl' ? 'jotl' : edition === 'fc' ? 'fc' : 'fh';
}

function cardImage(images: ImageIndex | undefined, character: Character, card: AbilityCard | undefined) {
  if (!images || !card?.name) return undefined;
  return images.abilityCards[`${editionPrefix(character.edition)}:${slug(character.name)}`]?.[slug(card.name)];
}

export function Hands() {
  const { state } = useCampaign();
  const me = useMe();
  const owners = state!.ext.characterOwners;
  const characters = gameManager.game.figures.filter((f): f is Character => f instanceof Character && !f.absent);
  const mine = characters.filter((c) => owners[characterKey(c)] === me.id || (!owners[characterKey(c)] && me.role === 'admin'));
  return (
    <div className="grid gap-3">
      <RoundStatus characters={characters} />
      {mine.map((c) => (
        <HandPanel key={characterKey(c)} character={c} />
      ))}
      {mine.length === 0 && <p className="text-sm text-frost-400">You don't control a character in this scenario.</p>}
    </div>
  );
}

function ready(h: HandState | undefined) {
  return !!h && (h.longRest || h.selected.length === 2);
}

function RoundStatus({ characters }: { characters: Character[] }) {
  const { state, send } = useCampaign();
  const hands = state!.ext.hands ?? {};
  if (gameManager.game.state !== GameState.draw) return null;
  const playing = characters.filter((c) => !c.exhausted);
  const waiting = playing.filter((c) => !ready(hands[characterKey(c)]));
  return (
    <div className="panel flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      {waiting.length ? (
        <span className="text-frost-300">Waiting for {waiting.map((c) => gameManager.characterManager.characterName(c)).join(', ')}</span>
      ) : (
        <span className="text-moss-400">Everyone has chosen.</span>
      )}
      <button className="btn btn-primary ml-auto" disabled={waiting.length > 0} onClick={() => send('hands.reveal').catch(() => {})}>
        Reveal cards
      </button>
    </div>
  );
}

function HandPanel({ character }: { character: Character }) {
  const { state, send } = useCampaign();
  const images = useImages();
  const key = characterKey(character);
  const h = state!.ext.hands?.[key];
  const ref = { edition: character.edition, name: character.name };
  const run = (type: string, payload: object = {}) => send(type, { ...ref, ...payload }).catch(() => {});
  const abilities = gameManager.deckData(character).abilities;
  const card = (id: number) => abilities.find((a) => a.cardId === id);
  const name = gameManager.characterManager.characterName(character);

  if (!h) return <PickHand character={character} images={images} />;

  const draw = gameManager.game.state === GameState.draw;
  return (
    <Panel title={`${name} · cards`}>
      {draw && !h.revealed && <ChooseCards character={character} hand={h} images={images} />}
      {h.revealed && h.selected.length > 0 && (
        <div className="mb-3">
          <div className="label mb-1">Play your cards</div>
          <div className="flex flex-wrap gap-2">
            {h.selected.map((id) => (
              <div key={id} className="grid w-36 gap-1">
                <CardView image={cardImage(images, character, card(id))} card={card(id)} leading={h.leading === id} />
                <div className="flex gap-1">
                  {(['discard', 'lost', 'active'] as const).map((to) => (
                    <button key={to} className="btn flex-1 px-1 py-0.5 text-[11px]" onClick={() => run('hands.play', { cardId: id, to })}>
                      {to}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {h.longRest && h.revealed && <LongRest character={character} hand={h} images={images} />}
      {h.active.length > 0 && <ActiveCards character={character} hand={h} images={images} />}
      <Piles character={character} hand={h} images={images} />
      <BattleGoals character={character} />
    </Panel>
  );
}

/** Private battle goals: deal three, keep one (FH). Hidden from other players. */
function BattleGoals({ character }: { character: Character }) {
  const { send } = useCampaign();
  const ref = { edition: character.edition, name: character.name };
  const goals = character.battleGoals.map((id) => gameManager.battleGoalManager.getBattleGoal(id)).filter((g) => !!g);
  const text = (cardId: string) => `${labelText(`data.battleGoals.${cardId}`)}: ${labelText(`data.battleGoals.${cardId}.text`)}`;
  const checks = (n: number) => (
    <span className="whitespace-nowrap font-mono text-xs text-moss-400" title={`${n} checkmark${n === 1 ? '' : 's'}`}>
      {'✓'.repeat(n)}
    </span>
  );
  return (
    <div className="mt-3 border-t border-ink-700 pt-2 text-sm">
      <div className="label mb-1">Battle goal</div>
      {goals.length === 0 ? (
        <button className="btn px-2 py-1 text-xs" onClick={() => send('battleGoals.deal', ref).catch(() => {})}>
          Deal battle goals
        </button>
      ) : character.battleGoal ? (
        <p className="flex items-start gap-2">
          <span className="flex-1">{text(goals[0]!.cardId)}</span>
          {checks(goals[0]!.checks ?? 1)}
        </p>
      ) : (
        <ul className="grid gap-1">
          {goals.map((g, index) => (
            <li key={g.cardId} className="flex items-start gap-2">
              <span className="flex-1">{text(g.cardId)}</span>
              {checks(g.checks ?? 1)}
              <button className="btn px-2 py-0.5 text-xs" onClick={() => send('battleGoals.choose', { ...ref, index }).catch(() => {})}>
                Keep
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A card in a pile. Without an onClick of its own, clicking a known card opens a larger view of it. */
function CardView({ image, card, selected, leading, onClick }: { image?: string; card?: AbilityCard; selected?: boolean; leading?: boolean; onClick?(): void }) {
  const [zoomed, setZoomed] = useState(false);
  const zoomable = !onClick && !!card;
  return (
    <>
      <button
        className={`relative overflow-hidden rounded-lg border text-left ${selected ? 'border-ice-400 ring-2 ring-ice-400' : 'border-ink-600'} ${onClick || zoomable ? 'hover:border-ice-300' : 'cursor-default'}`}
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

function PickHand({ character, images }: { character: Character; images?: ImageIndex }) {
  const { send } = useCampaign();
  const available = availableAbilityCards({ gm: gameManager }, character);
  const size = handSize({ gm: gameManager }, character);
  const [chosen, setChosen] = useState<number[]>(() => (available.length <= size ? available.map((a) => a.cardId!) : []));
  const toggle = (id: number) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length < size ? [...chosen, id] : chosen);
  return (
    <Panel title={`${gameManager.characterManager.characterName(character)} · pick ${size} cards`}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {available.map((a) => (
          <CardView key={a.cardId} card={a} image={cardImage(images, character, a)} selected={chosen.includes(a.cardId!)} onClick={() => toggle(a.cardId!)} />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-frost-400">
          {chosen.length}/{size}
        </span>
        <button
          className="btn btn-primary ml-auto"
          disabled={!chosen.length}
          onClick={() => send('hands.setup', { edition: character.edition, name: character.name, cards: chosen }).catch(() => {})}
        >
          Take these cards
        </button>
      </div>
    </Panel>
  );
}

function ChooseCards({ character, hand, images }: { character: Character; hand: HandState; images?: ImageIndex }) {
  const { send } = useCampaign();
  const ref = { edition: character.edition, name: character.name };
  const abilities = gameManager.deckData(character).abilities;
  const card = (id: number) => abilities.find((a) => a.cardId === id);
  const [picked, setPicked] = useState<number[]>(hand.selected);
  const [leading, setLeading] = useState<number | undefined>(hand.leading);
  const submit = (cards: number[], lead: number | undefined) =>
    send('hands.select', { ...ref, cards, ...(lead !== undefined ? { leading: lead } : {}) }).catch(() => {});
  const toggle = (id: number) => {
    let next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(-2);
    const lead = leading !== undefined && next.includes(leading) ? leading : next[0];
    setPicked(next);
    setLeading(lead);
    submit(next, lead);
  };
  const choices = [...hand.hand, ...hand.selected];
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="label">Choose two cards</span>
        {hand.longRest ? <span className="text-xs text-moss-400">long rest declared</span> : hand.selected.length === 2 && <span className="text-xs text-moss-400">ready</span>}
        <button
          className="btn ml-auto px-2 py-0.5 text-xs"
          disabled={hand.discard.length < 2}
          onClick={() => send('hands.select', { ...ref, longRest: !hand.longRest }).catch(() => {})}
        >
          {hand.longRest ? 'Cancel long rest' : 'Long rest'}
        </button>
      </div>
      {!hand.longRest && (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {choices.map((id) => (
              <CardView key={id} card={card(id)} image={cardImage(images, character, card(id))} selected={picked.includes(id)} leading={leading === id && picked.length > 0} onClick={() => toggle(id)} />
            ))}
          </div>
          {picked.length === 2 && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-frost-400">Initiative from</span>
              {picked.map((id) => (
                <label key={id} className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={leading === id}
                    onChange={() => {
                      setLeading(id);
                      submit(picked, id);
                    }}
                  />
                  {card(id)?.name} ({card(id)?.initiative})
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Persistent and round bonuses in play, with their use slots to mark. */
function ActiveCards({ character, hand, images }: { character: Character; hand: HandState; images?: ImageIndex }) {
  const { send } = useCampaign();
  const abilities = gameManager.deckData(character).abilities;
  const card = (id: number) => abilities.find((a) => a.cardId === id);
  const mark = (cardId: number, delta: 1 | -1) => send('hands.mark', { edition: character.edition, name: character.name, cardId, delta }).catch(() => {});
  return (
    <div className="mb-3">
      <div className="label mb-1">Active</div>
      <div className="flex flex-wrap gap-2">
        {hand.active.map((id) => {
          const slots = cardSlots(card(id));
          const used = hand.counters?.[id] ?? 0;
          return (
            <div key={id} className="grid w-36 content-start gap-1">
              <CardView image={cardImage(images, character, card(id))} card={card(id)} />
              {slots.length > 0 && (
                <div className="flex flex-wrap items-center gap-1" title={`${used}/${slots.length} uses`}>
                  {slots.map((slot, index) => {
                    const marked = index < used;
                    // Only the next free slot or the last marked one can be toggled.
                    const toggle = index === used ? 1 : index === used - 1 ? -1 : undefined;
                    return (
                      <button
                        key={index}
                        className={`grid h-5 w-5 place-items-center rounded-full border text-[9px] font-semibold ${marked ? 'border-ice-400 bg-ice-400 text-ink-950' : 'border-ink-500 text-frost-400'} ${toggle ? 'hover:border-ice-300' : 'cursor-default'}`}
                        disabled={!toggle}
                        onClick={() => toggle && mark(id, toggle)}
                        title={`${marked ? 'Unmark' : 'Mark'} use ${index + 1}${slot.xp ? ` (+${slot.xp} XP)` : ''}`}
                      >
                        {slot.xp ? `+${slot.xp}` : ''}
                      </button>
                    );
                  })}
                  {used === slots.length && <span className="text-[10px] text-moss-400">used up</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LongRest({ character, hand, images }: { character: Character; hand: HandState; images?: ImageIndex }) {
  const { send } = useCampaign();
  const abilities = gameManager.deckData(character).abilities;
  const card = (id: number) => abilities.find((a) => a.cardId === id);
  return (
    <div className="mb-3">
      <div className="label mb-1">Long rest: lose one card from your discard pile</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {hand.discard.map((id) => (
          <CardView
            key={id}
            card={card(id)}
            image={cardImage(images, character, card(id))}
            onClick={() => send('hands.longRest', { edition: character.edition, name: character.name, lose: id }).catch(() => {})}
          />
        ))}
      </div>
    </div>
  );
}

function Piles({ character, hand, images }: { character: Character; hand: HandState; images?: ImageIndex }) {
  const { send } = useCampaign();
  const ref = { edition: character.edition, name: character.name };
  const abilities = gameManager.deckData(character).abilities;
  const card = (id: number) => abilities.find((a) => a.cardId === id);
  const [open, setOpen] = useState<'discard' | 'lost' | 'active' | 'hand'>();
  const piles = [
    { key: 'hand' as const, label: 'Hand', cards: hand.hand },
    { key: 'discard' as const, label: 'Discard', cards: hand.discard },
    { key: 'active' as const, label: 'Active', cards: hand.active },
    { key: 'lost' as const, label: 'Lost', cards: hand.lost }
  ];
  return (
    <div className="grid gap-2 text-sm">
      <div className="flex flex-wrap gap-2">
        {piles.map((p) => (
          <button key={p.key} className={`btn px-2 py-1 text-xs ${open === p.key ? 'border-ice-400' : ''}`} onClick={() => setOpen(open === p.key ? undefined : p.key)}>
            {p.label} {p.cards.filter((c) => c !== HIDDEN_CARD).length}
          </button>
        ))}
        <button
          className="btn ml-auto px-2 py-1 text-xs"
          disabled={hand.discard.length < 2}
          onClick={() => confirm('Short rest: lose a random card from your discard pile?') && send('hands.shortRest', ref).catch(() => {})}
        >
          Short rest
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-4 gap-2">
          {piles
            .find((p) => p.key === open)!
            .cards.map((id) => (
              <div key={id} className="grid gap-1">
                <CardView card={card(id)} image={cardImage(images, character, card(id))} />
                <select
                  className="input py-0.5 text-[11px]"
                  value=""
                  onChange={(e) => {
                    const to = e.target.value;
                    if (to === 'negate') send('hands.negateDamage', { ...ref, from: open === 'hand' ? 'hand' : 'discard', cards: [id] }).catch(() => {});
                    else if (to) send('hands.move', { ...ref, cardId: id, to }).catch(() => {});
                  }}
                >
                  <option value="">Move…</option>
                  {(['hand', 'discard', 'active', 'lost'] as const)
                    .filter((to) => to !== open)
                    .map((to) => (
                      <option key={to} value={to}>
                        to {to}
                      </option>
                    ))}
                  {open === 'hand' && <option value="negate">lose to negate damage</option>}
                </select>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
