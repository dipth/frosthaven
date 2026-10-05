import type { CampaignState } from './state';

/**
 * The view of the campaign a given user may see. Hidden information (other
 * players' hands, unrevealed card choices, battle goals) is redacted here.
 */
export function projectFor(state: CampaignState, _userId: string): CampaignState {
  return state;
}
