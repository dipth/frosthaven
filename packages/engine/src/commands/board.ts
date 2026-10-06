/**
 * Online mode: the hex map. Static content (tiles, overlays, starting tokens,
 * spawn points) comes from the scenario's board data (packages/data boards);
 * this tracks where figures stand and which board items were removed.
 * Movement is free: players move figures the way the cards say.
 */
import { Character, Monster } from '@fh/ghs-core';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { CommandError, defineCommand, type CommandContext, type CommandDef } from '../runtime';
import type { CampaignState, CharacterToken, Hex } from '../state';
import { board, boardKey } from './board-state';
import { assertControl, entityRef, resolveFigure, type EntityRef } from './play';

const hex = z.object({ x: z.number().int().min(-200).max(200), y: z.number().int().min(-200).max(200) });

function control(state: CampaignState, refs: EntityRef[], ctx: CommandContext) {
  assertControl(state, refs, ctx);
}

const placement = z.object({ ref: entityRef, hex: hex.nullable() });

const characterRef = z.object({ edition: z.string(), name: z.string() });

/** The character a token belongs to. */
function tokenOwner(state: CampaignState, id: string): EntityRef | undefined {
  const token = state.ext.board?.characterTokens?.find((t) => t.id === id);
  return token && { kind: 'character', edition: token.edition, name: token.name };
}

const sameToken = (a: CharacterToken, b: { edition: string; name: string }) => a.edition === b.edition && a.name === b.name;

const commands: CommandDef[] = [
  defineCommand({
    type: 'board.move',
    payload: placement,
    authorize: (state, p, ctx) => control(state, [p.ref], ctx),
    run(rt, { ref, hex: to }) {
      const b = board(rt);
      const key = boardKey(ref);
      if (!to) {
        delete b.positions[key];
        return;
      }
      const occupant = Object.entries(b.positions).find(([k, h]) => k !== key && h.x === to.x && h.y === to.y);
      if (occupant) throw new CommandError('Someone is already standing there');
      b.positions[key] = to;
    }
  }),
  defineCommand({
    type: 'board.place',
    payload: z.object({ placements: z.array(z.object({ ref: entityRef, hex })).max(100) }),
    authorize: (state, p, ctx) => control(state, p.placements.map((x) => x.ref), ctx),
    run(rt, { placements }) {
      const b = board(rt);
      const taken = new Set(Object.values(b.positions).map((h: Hex) => `${h.x},${h.y}`));
      for (const { ref, hex: at } of placements) {
        const key = boardKey(ref);
        if (b.positions[key] || taken.has(`${at.x},${at.y}`)) continue;
        b.positions[key] = at;
        taken.add(`${at.x},${at.y}`);
      }
    }
  }),
  defineCommand({
    type: 'board.numberStandees',
    payload: z.object({}),
    run(rt) {
      // Online there is no bag of standees: draw numbers for monsters spawned without one.
      for (const figure of rt.game.figures) {
        if (!(figure instanceof Monster)) continue;
        for (const entity of figure.entities.filter((e) => e.number < 0 && !e.dead)) {
          const number = rt.gm.monsterManager.monsterRandomStandee(figure);
          if (number > 0) entity.number = number;
        }
      }
    }
  }),
  defineCommand({
    type: 'board.toggleItem',
    payload: z.object({ id: z.string().max(40), removed: z.boolean() }),
    run(rt, { id, removed }) {
      const b = board(rt);
      b.removed = b.removed.filter((x) => x !== id);
      if (removed) b.removed.push(id);
    }
  }),
  defineCommand({
    type: 'board.addCharacterToken',
    payload: z.object({ character: characterRef, hex }),
    authorize: (state, p, ctx) => control(state, [{ kind: 'character', ...p.character }], ctx),
    run(rt, { character: ref, hex: at }) {
      const b = board(rt);
      const character = resolveFigure(rt, { kind: 'character', ...ref }) as Character;
      const tokens = (b.characterTokens ??= []);
      if (tokens.some((t) => sameToken(t, character) && t.hex.x === at.x && t.hex.y === at.y)) {
        throw new CommandError('That hex already has this token');
      }
      tokens.push({ id: uuidv4(), edition: character.edition, name: character.name, hex: at });
    }
  }),
  defineCommand({
    type: 'board.moveCharacterToken',
    // A null hex takes the token off the map.
    payload: z.object({ id: z.string().max(40), hex: hex.nullable() }),
    authorize: (state, p, ctx) => {
      const owner = tokenOwner(state, p.id);
      if (owner) control(state, [owner], ctx);
    },
    run(rt, { id, hex: to }) {
      const b = board(rt);
      const tokens = b.characterTokens ?? [];
      const token = tokens.find((t) => t.id === id);
      if (!token) throw new CommandError('That token is gone');
      if (!to) {
        b.characterTokens = tokens.filter((t) => t.id !== id);
        return;
      }
      if (tokens.some((t) => t.id !== id && sameToken(t, token) && t.hex.x === to.x && t.hex.y === to.y)) {
        throw new CommandError('That hex already has this token');
      }
      token.hex = to;
    }
  }),
  defineCommand({
    type: 'board.pickUpLoot',
    payload: z.object({ index: z.number().int().min(0) }),
    run(rt, { index }) {
      const b = board(rt);
      if (!b.loot?.[index]) throw new CommandError('No loot token there');
      b.loot.splice(index, 1);
    }
  })
];

export const boardCommands = commands;
