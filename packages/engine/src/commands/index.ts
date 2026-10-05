import { Character, GameState } from '@fh/ghs-core';
import { z } from 'zod';
import { CommandError, defineCommand, runCommand, type CommandContext, type CommandDef, type ExecuteResult } from '../runtime';
import { characterKey, type CampaignState } from '../state';
import { playableClasses } from '../classes';
import { scenarioCommands } from './scenario';

/** Players may act for their own characters; admins and unowned characters are open to everyone. */
export function assertCanControlCharacter(state: CampaignState, key: string, ctx: CommandContext) {
  const owner = state.ext.characterOwners[key];
  if (!ctx.isAdmin && owner && owner !== ctx.userId) {
    throw new CommandError(`Character ${key} belongs to another player`, 'forbidden');
  }
}

const characterRef = z.object({ edition: z.string(), name: z.string() });

export function findCharacter(rt: { game: { figures: unknown[] } }, ref: { edition: string; name: string }): Character {
  const character = rt.game.figures.find(
    (f): f is Character => f instanceof Character && f.edition === ref.edition && f.name === ref.name
  );
  if (!character) {
    throw new CommandError(`No character ${ref.edition}:${ref.name} in play`);
  }
  return character;
}

const partyRename = defineCommand({
  type: 'party.rename',
  payload: z.object({ name: z.string().trim().min(1).max(100) }),
  run(rt, { name }) {
    rt.gm.stateManager.before('setPartyName', name);
    rt.game.party.name = name;
    rt.gm.stateManager.after();
    rt.log(`Renamed the party to "${name}"`);
  }
});

const characterAdd = defineCommand({
  type: 'character.add',
  payload: characterRef.extend({ level: z.number().int().min(1).max(9).default(1) }),
  run(rt, { edition, name, level }, ctx) {
    const data = playableClasses(rt.gm).find((c) => c.edition === edition && c.name === name);
    if (!data) {
      throw new CommandError(`Unknown character class ${edition}:${name}`, 'invalid_payload');
    }
    rt.gm.stateManager.before('addChar', 'data.character.' + data.edition + '.' + data.name);
    rt.gm.characterManager.addCharacter(data, level);
    rt.gm.stateManager.after();
    rt.ext.characterOwners[characterKey(data)] ??= ctx.userId;
  }
});

const characterSetOwner = defineCommand({
  type: 'character.setOwner',
  payload: characterRef.extend({ userId: z.string().nullable() }),
  run(rt, { edition, name, userId }, ctx) {
    const key = characterKey({ edition, name });
    const current = rt.ext.characterOwners[key];
    if (!ctx.isAdmin && current && current !== ctx.userId) {
      throw new CommandError('Only the owner or an admin can reassign a character', 'forbidden');
    }
    if (userId) {
      rt.ext.characterOwners[key] = userId;
    } else {
      delete rt.ext.characterOwners[key];
    }
  }
});

const characterInitiative = defineCommand({
  type: 'character.initiative',
  payload: characterRef.extend({ initiative: z.number().int().min(0).max(99) }),
  authorize(state, payload, ctx) {
    assertCanControlCharacter(state, characterKey(payload), ctx);
  },
  run(rt, payload) {
    const character = findCharacter(rt, payload);
    rt.gm.stateManager.before('setInitiative', 'data.character.' + character.edition + '.' + character.name, payload.initiative);
    character.initiative = payload.initiative;
    character.longRest = payload.initiative === 99;
    rt.gm.stateManager.after();
  }
});

const roundNext = defineCommand({
  type: 'round.next',
  payload: z.object({ force: z.boolean().default(false) }),
  run(rt, { force }) {
    if (rt.game.state === GameState.draw && !force && !rt.gm.roundManager.drawAvailable()) {
      throw new CommandError('Not all characters have chosen an initiative');
    }
    rt.gm.stateManager.before(rt.game.state === GameState.next ? 'nextRound' : 'draw');
    if (rt.game.state === GameState.next) {
      let lastActive = rt.game.figures.find((figure) => rt.gm.gameplayFigure(figure) && !figure.off);
      while (lastActive) {
        rt.gm.roundManager.toggleFigure(lastActive, true);
        lastActive = rt.game.figures.find((figure) => rt.gm.gameplayFigure(figure) && !figure.off);
      }
    }
    rt.gm.roundManager.nextGameState(force);
    rt.gm.stateManager.after();
  }
});

const allCommands: CommandDef[] = [partyRename, characterAdd, characterSetOwner, characterInitiative, roundNext, ...scenarioCommands];

export const commands: Record<string, CommandDef> = Object.fromEntries(allCommands.map((c) => [c.type, c]));

export type CommandType = keyof typeof commands;

export function executeCommand(state: CampaignState, type: string, payload: unknown, ctx: CommandContext): ExecuteResult {
  const def = commands[type];
  if (!def) {
    throw new CommandError(`Unknown command ${type}`, 'unknown_command');
  }
  return runCommand(def, state, payload, ctx);
}
