/** WebSocket protocol between the web client and the campaign hub. */
import { z } from 'zod';
import type { CommandLog } from './runtime';
import type { CampaignState } from './state';

export const clientMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('cmd'), id: z.string(), type: z.string(), payload: z.unknown() }),
  z.object({ t: z.literal('undo'), id: z.string(), force: z.boolean().optional() }),
  z.object({ t: z.literal('ping') })
]);
export type ClientMessage = z.infer<typeof clientMessage>;

export interface PresenceUser {
  id: string;
  displayName: string;
}

export interface LogLine {
  revision: number;
  userId: string | null;
  type: string;
  log: CommandLog;
  createdAt: string;
}

export type ServerMessage =
  | { t: 'state'; revision: number; state: CampaignState; log?: LogLine }
  | { t: 'ack'; id: string; revision: number }
  | { t: 'reject'; id: string; code: string; error: string }
  | { t: 'presence'; users: PresenceUser[] }
  | { t: 'pong' };

/**
 * Commands that reveal hidden or random information (card draws, shuffles,
 * reveals). Undoing them could be used to redraw, so the hub asks for
 * confirmation first.
 */
export const REVEALING_COMMANDS = new Set([
  'am.draw',
  'am.shuffle',
  'loot.draw',
  'round.next',
  'monster.drawAbility',
  'monster.shuffleAbilities',
  'eventDraw.start',
  'eventDraw.redraw',
  'events.shuffle',
  'hands.reveal',
  'hands.shortRest',
  'battleGoals.deal',
  'outpostAttack.draw',
  'board.numberStandees',
  'character.retireStart'
]);
