/**
 * Event deck management, ported from GHS
 * src/app/ui/figures/event/deck/event-card-deck.ts (AGPL-3.0). These keep the
 * app's decks in step with the physical decks; drawing and resolving events is
 * part of the outpost / travel flow.
 */
import { z } from 'zod';
import { CommandError, defineCommand, type CommandDef, type Runtime } from '../runtime';

function edition(rt: Runtime) {
  return rt.game.edition ?? rt.gm.currentEdition();
}

function assertType(rt: Runtime, type: string) {
  if (!rt.gm.eventCardManager.getEventTypesForEdition(edition(rt)).includes(type)) {
    throw new CommandError(`Unknown event deck ${type}`, 'invalid_payload');
  }
}

function assertCard(rt: Runtime, type: string, cardId: string) {
  if (!rt.gm.eventCardManager.getEventCardForEdition(edition(rt), type, cardId)) {
    throw new CommandError(`Unknown ${type} event ${cardId}`, 'invalid_payload');
  }
}

const deck = z.object({ type: z.string() });
const card = deck.extend({ cardId: z.string() });

const commands: CommandDef[] = [
  defineCommand({
    type: 'events.buildDeck',
    payload: deck,
    run(rt, { type }) {
      assertType(rt, type);
      if (rt.game.party.eventDecks[type]?.length) {
        throw new CommandError(`The ${type} deck already has cards; reset it first`);
      }
      rt.gm.stateManager.before('events.deck.reset', type);
      rt.gm.eventCardManager.buildPartyDeck(edition(rt), type);
      rt.gm.stateManager.after();
      rt.log(`Built the ${type} deck from the starting cards (${rt.game.party.eventDecks[type]?.length ?? 0} cards)`);
    }
  }),
  defineCommand({
    type: 'events.rebuildAll',
    payload: z.object({}),
    run(rt) {
      rt.gm.stateManager.before('events.deck.reset', 'all');
      rt.game.party.eventDecks = {};
      rt.gm.eventCardManager.buildPartyDeckMigration(edition(rt));
      rt.gm.stateManager.after();
      const decks = Object.entries(rt.game.party.eventDecks).map(([type, cards]) => `${type} ${cards?.length ?? 0}`);
      rt.log(`Rebuilt the event decks from campaign progress (${decks.join(', ')})`);
    }
  }),
  defineCommand({
    type: 'events.addCard',
    payload: card.extend({ position: z.enum(['shuffle', 'top', 'bottom']).default('shuffle') }),
    run(rt, { type, cardId, position }) {
      assertType(rt, type);
      assertCard(rt, type, cardId);
      const cards = (rt.game.party.eventDecks[type] ??= []);
      if (cards.includes(cardId)) {
        throw new CommandError(`${cardId} is already in the ${type} deck`);
      }
      rt.gm.stateManager.before('events.deck.addEvent', type, cardId);
      if (position === 'shuffle') {
        rt.gm.eventCardManager.addEvent(type, cardId);
      } else if (position === 'top') {
        cards.unshift(cardId);
      } else {
        cards.push(cardId);
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'events.removeCard',
    payload: card,
    run(rt, { type, cardId }) {
      if (!rt.game.party.eventDecks[type]?.includes(cardId)) {
        throw new CommandError(`${cardId} is not in the ${type} deck`);
      }
      rt.gm.stateManager.before('events.deck.removeEvent', type, cardId);
      rt.gm.eventCardManager.removeEvent(type, cardId);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'events.shuffle',
    payload: deck,
    run(rt, { type }) {
      assertType(rt, type);
      rt.gm.stateManager.before('events.deck.shuffle', type);
      rt.gm.eventCardManager.shuffleEvents(type);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'events.reorder',
    payload: deck.extend({ cardIds: z.array(z.string()) }),
    run(rt, { type, cardIds }) {
      const current = rt.game.party.eventDecks[type] ?? [];
      const sameCards = current.length === cardIds.length && [...current].sort().join() === [...cardIds].sort().join();
      if (!sameCards) {
        throw new CommandError('The new order must contain exactly the cards in the deck', 'invalid_payload');
      }
      rt.gm.stateManager.before('events.deck.reorder', type);
      rt.game.party.eventDecks[type] = [...cardIds];
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'events.reset',
    payload: deck,
    run(rt, { type }) {
      assertType(rt, type);
      rt.gm.stateManager.before('events.deck.reset', type);
      rt.game.party.eventDecks[type] = [];
      rt.game.party.eventCards = rt.game.party.eventCards.filter((value) => value.type !== type);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'events.removeDrawn',
    payload: card,
    run(rt, { type, cardId }) {
      const index = rt.game.party.eventCards.findIndex((id) => id.type === type && id.cardId === cardId);
      if (index < 0) {
        throw new CommandError(`${cardId} has not been drawn`);
      }
      rt.gm.stateManager.before('events.deck.removeDrawn', type, cardId);
      rt.game.party.eventCards.splice(index, 1);
      rt.gm.stateManager.after();
    }
  })
];

export const eventCommands = commands;
