import type { CampaignState, HandState } from './state';

/** Card ids other players may not see are replaced with this. */
export const HIDDEN_CARD = -1;

const hide = (cards: number[]) => cards.map(() => HIDDEN_CARD);

/**
 * The view of the campaign a given user may see. In online mode, other
 * players' hands and unrevealed card choices are reduced to counts, and their
 * decks, battle goals and personal quests are hidden. Characters without a player
 * are visible to everyone (e.g. a shared table device).
 */
export function projectFor(state: CampaignState, userId: string): CampaignState {
  if (state.ext.mode !== 'online') {
    return state;
  }
  const owners = state.ext.characterOwners;
  const hiddenFrom = (key: string) => !!owners[key] && owners[key] !== userId;
  let hands = state.ext.hands;
  if (hands) {
    hands = Object.fromEntries(
      Object.entries(hands).map(([key, h]): [string, HandState] => {
        if (!hiddenFrom(key)) return [key, h];
        const view: HandState = { ...h, hand: hide(h.hand) };
        if (!h.revealed) {
          view.selected = hide(h.selected);
          delete view.leading;
          delete view.longRest;
          if (h.longRest) view.selected = [HIDDEN_CARD, HIDDEN_CARD];
        }
        return [key, view];
      })
    );
  }
  const characters = state.ghs.characters.map((c) => {
    if (!hiddenFrom(`${c.edition}:${c.name}`)) return c;
    const progress = c.progress ? { ...c.progress, personalQuest: '', personalQuestProgress: [] } : c.progress;
    return { ...c, battleGoals: [], progress };
  });
  // Decks give away what's in a hand.
  const own = (decks: Record<string, number[]> | undefined) => decks && Object.fromEntries(Object.entries(decks).filter(([key]) => !hiddenFrom(key)));
  const decks = own(state.ext.decks);
  const scenarioDecks = own(state.ext.scenarioDecks);
  return {
    ghs: { ...state.ghs, characters },
    ext: { ...state.ext, ...(hands ? { hands } : {}), ...(decks ? { decks } : {}), ...(scenarioDecks ? { scenarioDecks } : {}) }
  };
}
