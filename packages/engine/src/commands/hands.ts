/**
 * Online mode: ability card hands. Players pick their hand before the
 * scenario, secretly choose two cards (or a long rest) each round, reveal
 * together (which sets initiatives and starts the round), then play the
 * halves to discard, lost or active. Other players only see card counts
 * until cards are revealed (see visibility.ts). Card text is never resolved
 * here: players do what the card says.
 */
import { Character, GameState } from '@fh/ghs-core';
import type { AbilityCard } from '@fh/ghs-core/vendor/game/model/data/AbilityCard';
import type { Action } from '@fh/ghs-core/vendor/game/model/data/Action';
import { z } from 'zod';
import { CommandError, defineCommand, type CommandContext, type CommandDef, type Runtime } from '../runtime';
import { characterKey, type CampaignState, type CardPile, type HandState } from '../state';
import { assertOwner } from './character';

const ref = z.object({ edition: z.string(), name: z.string() });
const pile = z.enum(['hand', 'discard', 'lost', 'active']);
const PILES: CardPile[] = ['hand', 'discard', 'lost', 'active'];

function authorize(state: CampaignState, payload: { edition: string; name: string }, ctx: CommandContext) {
  assertOwner(state, payload, ctx);
}

function character(rt: Runtime, payload: { edition: string; name: string }): Character {
  const c = rt.game.figures.find((f): f is Character => f instanceof Character && f.edition === payload.edition && f.name === payload.name);
  if (!c) throw new CommandError(`No character ${payload.edition}:${payload.name} in the party`);
  return c;
}

function hand(rt: Runtime, c: Character): HandState {
  const h = rt.ext.hands?.[characterKey(c)];
  if (!h) throw new CommandError(`${rt.gm.characterManager.characterName(c)} hasn't picked a hand yet`);
  return h;
}

/** Cards a character may take into a scenario: level 1 and X, plus cards added at level-up. */
export function availableAbilityCards(rt: Pick<Runtime, 'gm'>, c: Character) {
  return rt.gm.deckData(c).abilities.filter((a, i) => a.level === 1 || a.level === 'X' || c.progress.deck.includes(i));
}

export function handSize(rt: Pick<Runtime, 'gm'>, c: Character): number {
  return Number(rt.gm.getCharacterData(c.name, c.edition)?.handSize ?? 0);
}

/**
 * The character's stored deck, without cards that are no longer available.
 * Without a saved deck, all available cards when they fit in the hand.
 */
export function storedDeck(rt: Pick<Runtime, 'gm'>, ext: Pick<CampaignState['ext'], 'decks'>, c: Character): number[] | undefined {
  const available = availableAbilityCards(rt, c).map((a) => a.cardId!);
  const saved = ext.decks?.[characterKey(c)];
  if (saved) return saved.filter((id) => available.includes(id));
  return available.length <= handSize(rt, c) ? available : undefined;
}

/** Checks a deck of card ids against the character's available cards and hand size. */
function validDeck(rt: Runtime, c: Character, cards: number[]): number[] {
  const available = new Set(availableAbilityCards(rt, c).map((a) => a.cardId));
  const deck = [...new Set(cards)];
  if (deck.some((id) => !available.has(id))) throw new CommandError("Some of those cards aren't available to this character", 'invalid_payload');
  const size = handSize(rt, c);
  if (size && deck.length > size) throw new CommandError(`The hand holds ${size} cards`);
  return deck;
}

function slotsOf(actions: Action[] | undefined): { xp: number }[] {
  return (actions ?? []).flatMap((action) => {
    const own = action.type === 'card' && String(action.value).startsWith('slot') ? [{ xp: Number(String(action.value).split(':')[1] ?? 0) }] : [];
    return [...own, ...slotsOf(action.subActions)];
  });
}

/**
 * The use slots printed on a card (GHS `card` actions `slot`, `slotXp:1`,
 * `slotStart`, `slotEnd`...), with the experience each slot gives when
 * marked. Uses the half with the most slots.
 */
export function cardSlots(card: AbilityCard | undefined): { xp: number }[] {
  if (!card) return [];
  const top = slotsOf(card.actions);
  const bottom = slotsOf(card.bottomActions);
  return bottom.length > top.length ? bottom : top;
}

function initiativeOf(rt: Runtime, c: Character, cardId: number): number {
  const card = rt.gm.deckData(c).abilities.find((a) => a.cardId === cardId);
  if (!card) throw new CommandError(`Unknown card ${cardId}`, 'invalid_payload');
  return Number(card.initiative);
}

function take(h: HandState, cardId: number): CardPile {
  for (const name of PILES) {
    const index = h[name].indexOf(cardId);
    if (index >= 0) {
      h[name].splice(index, 1);
      return name;
    }
  }
  const selected = h.selected.indexOf(cardId);
  if (selected >= 0) {
    h.selected.splice(selected, 1);
    return 'hand';
  }
  throw new CommandError("That card isn't in play", 'invalid_payload');
}

/** Characters that take part in the card round (present, not exhausted). */
function playing(rt: Runtime): Character[] {
  return rt.game.figures.filter((f): f is Character => f instanceof Character && !f.absent && !f.exhausted);
}

function ready(h: HandState | undefined) {
  return !!h && (h.longRest || (h.selected.length === 2 && h.leading !== undefined));
}

const commands: CommandDef[] = [
  defineCommand({
    type: 'deck.set',
    payload: ref.extend({ cards: z.array(z.number().int()).max(30) }),
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      if (rt.game.scenario) throw new CommandError('Change your deck between scenarios; pick a temporary deck at the start of a scenario instead');
      (rt.ext.decks ??= {})[characterKey(c)] = validDeck(rt, c, payload.cards);
    }
  }),
  defineCommand({
    type: 'hands.setup',
    /** Without cards, the stored deck; with cards, a temporary deck for this scenario (kept across resets). */
    payload: ref.extend({ cards: z.array(z.number().int()).max(30).optional() }),
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      const key = characterKey(c);
      if (rt.ext.hands?.[key] && rt.game.round > 0) throw new CommandError('The hand is fixed once the scenario has started');
      let cards: number[];
      if (payload.cards) {
        cards = validDeck(rt, c, payload.cards);
        (rt.ext.scenarioDecks ??= {})[key] = cards;
      } else {
        const stored = storedDeck(rt, rt.ext, c);
        if (!stored?.length) throw new CommandError(`${rt.gm.characterManager.characterName(c)} has no stored deck yet`);
        cards = stored;
      }
      // Each round takes two cards (or a long rest with two discarded).
      if (cards.length < 2) throw new CommandError('A deck needs at least two cards');
      (rt.ext.hands ??= {})[key] = { hand: [...cards], discard: [], lost: [], active: [], selected: [] };
      rt.log(`${rt.gm.characterManager.characterName(c)} took ${payload.cards ? 'a temporary deck' : 'their stored deck'} of ${cards.length} cards`);
    }
  }),
  defineCommand({
    type: 'hands.select',
    payload: ref.extend({ cards: z.array(z.number().int()).max(2).default([]), leading: z.number().int().optional(), longRest: z.boolean().default(false) }),
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      const h = hand(rt, c);
      if (rt.game.state !== GameState.draw) throw new CommandError('Choose cards before the round starts');
      if (h.revealed) throw new CommandError('Cards are already revealed');
      // Put back the previous choice.
      h.hand.push(...h.selected);
      h.selected = [];
      delete h.leading;
      delete h.longRest;
      if (payload.longRest) {
        if (h.discard.length < 2) throw new CommandError('A long rest needs at least two cards in the discard pile');
        h.longRest = true;
        return;
      }
      for (const id of payload.cards) {
        const index = h.hand.indexOf(id);
        if (index < 0) throw new CommandError("You can only choose cards from your hand", 'invalid_payload');
        h.hand.splice(index, 1);
        h.selected.push(id);
      }
      if (h.selected.length) {
        const leading = payload.leading ?? h.selected[0]!;
        if (!h.selected.includes(leading)) throw new CommandError('The leading card must be one of the chosen cards', 'invalid_payload');
        h.leading = leading;
      }
    }
  }),
  defineCommand({
    type: 'hands.reveal',
    payload: z.object({ force: z.boolean().default(false) }),
    run(rt, { force }) {
      if (rt.game.state !== GameState.draw) throw new CommandError('Cards are revealed at the start of a round');
      const characters = playing(rt);
      const waiting = characters.filter((c) => !ready(rt.ext.hands?.[characterKey(c)]));
      if (waiting.length && !force) {
        throw new CommandError(`Waiting for ${waiting.map((c) => rt.gm.characterManager.characterName(c)).join(', ')}`);
      }
      rt.gm.stateManager.before('draw');
      for (const c of characters) {
        const h = rt.ext.hands?.[characterKey(c)];
        if (!ready(h)) continue;
        c.initiativeVisible = true;
        if (h!.longRest) {
          c.longRest = true;
          c.initiative = 99;
        } else {
          c.longRest = false;
          c.initiative = initiativeOf(rt, c, h!.leading!);
        }
        h!.revealed = true;
      }
      rt.gm.roundManager.nextGameState(force);
      rt.gm.stateManager.after();
      rt.log('Cards revealed');
    }
  }),
  defineCommand({
    type: 'hands.play',
    payload: ref.extend({ cardId: z.number().int(), to: z.enum(['discard', 'lost', 'active']) }),
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      const h = hand(rt, c);
      if (!h.selected.includes(payload.cardId)) throw new CommandError('Play one of the chosen cards', 'invalid_payload');
      h.selected.splice(h.selected.indexOf(payload.cardId), 1);
      h[payload.to].push(payload.cardId);
      if (!h.selected.length) {
        delete h.leading;
        delete h.revealed;
      }
    }
  }),
  defineCommand({
    type: 'hands.move',
    payload: ref.extend({ cardId: z.number().int(), to: pile }),
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      const h = hand(rt, c);
      if (take(h, payload.cardId) === 'active' && h.counters) delete h.counters[payload.cardId];
      h[payload.to].push(payload.cardId);
      if (h.leading === payload.cardId) delete h.leading;
    }
  }),
  defineCommand({
    type: 'hands.mark',
    payload: ref.extend({ cardId: z.number().int(), delta: z.union([z.literal(1), z.literal(-1)]) }),
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      const h = hand(rt, c);
      if (!h.active.includes(payload.cardId)) throw new CommandError('Only active cards have use slots', 'invalid_payload');
      const slots = cardSlots(rt.gm.deckData(c).abilities.find((a) => a.cardId === payload.cardId));
      const used = h.counters?.[payload.cardId] ?? 0;
      const next = used + payload.delta;
      if (next < 0 || next > slots.length) throw new CommandError(next < 0 ? 'No slots are marked' : 'Every slot is already marked');
      (h.counters ??= {})[payload.cardId] = next;
      // Marking a slot with an experience icon gains that experience; unmarking takes it back.
      const xp = payload.delta > 0 ? slots[next - 1]!.xp : -slots[used - 1]!.xp;
      if (xp) c.experience = Math.max(0, c.experience + xp);
    }
  }),
  defineCommand({
    type: 'hands.shortRest',
    payload: ref,
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      const h = hand(rt, c);
      if (h.discard.length < 2) throw new CommandError('A short rest needs at least two cards in the discard pile');
      const lost = h.discard.splice(Math.floor(Math.random() * h.discard.length), 1)[0]!;
      h.lost.push(lost);
      h.hand.push(...h.discard);
      h.discard = [];
      rt.log(`${rt.gm.characterManager.characterName(c)} short rested and lost a random card`);
    }
  }),
  defineCommand({
    type: 'hands.longRest',
    payload: ref.extend({ lose: z.number().int() }),
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      const h = hand(rt, c);
      if (!h.discard.includes(payload.lose)) throw new CommandError('Lose a card from the discard pile', 'invalid_payload');
      h.discard.splice(h.discard.indexOf(payload.lose), 1);
      h.lost.push(payload.lose);
      h.hand.push(...h.discard);
      h.discard = [];
      delete h.longRest;
      delete h.revealed;
    }
  }),
  defineCommand({
    type: 'hands.negateDamage',
    payload: ref.extend({ from: z.enum(['hand', 'discard']), cards: z.array(z.number().int()).min(1).max(2) }),
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      const h = hand(rt, c);
      const needed = payload.from === 'hand' ? 1 : 2;
      if (payload.cards.length !== needed) throw new CommandError(`Lose ${needed} card${needed === 1 ? '' : 's'} from your ${payload.from}`, 'invalid_payload');
      for (const id of payload.cards) {
        const index = h[payload.from].indexOf(id);
        if (index < 0) throw new CommandError(`That card isn't in your ${payload.from}`, 'invalid_payload');
        h[payload.from].splice(index, 1);
        h.lost.push(id);
      }
      rt.log(`${rt.gm.characterManager.characterName(c)} lost ${needed} card${needed === 1 ? '' : 's'} to negate damage`);
    }
  }),
  defineCommand({
    type: 'battleGoals.deal',
    payload: ref,
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      rt.gm.stateManager.before('battleGoals.drawCards', rt.gm.characterManager.characterName(c, true, true));
      c.battleGoals = [];
      c.battleGoal = false;
      const count = rt.gm.fhRules(true) ? 3 : 2;
      for (let i = 0; i < count; i++) rt.gm.battleGoalManager.drawBattleGoal(c);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'battleGoals.choose',
    payload: ref.extend({ index: z.number().int().min(0).max(2) }),
    authorize,
    run(rt, payload) {
      const c = character(rt, payload);
      const chosen = c.battleGoals[payload.index];
      if (!chosen) throw new CommandError('No such battle goal', 'invalid_payload');
      rt.gm.stateManager.before('battleGoals.select', rt.gm.characterManager.characterName(c, true, true));
      c.battleGoals.splice(payload.index, 1);
      c.battleGoals.unshift(chosen);
      c.battleGoal = true;
      rt.gm.stateManager.after();
    }
  })
];

export const handCommands = commands;
