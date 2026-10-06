/**
 * Online mode: the hex map. Static content (tiles, overlays, starting tokens,
 * spawn points) comes from the scenario's board data (packages/data boards);
 * this tracks where figures stand and which board items were removed.
 * Movement is free: players move figures the way the cards say.
 */
import { Monster } from '@fh/ghs-core';
import { z } from 'zod';
import { CommandError, defineCommand, type CommandContext, type CommandDef } from '../runtime';
import type { CampaignState, Hex } from '../state';
import { board, boardKey } from './board-state';
import { assertControl, entityRef, type EntityRef } from './play';

const hex = z.object({ x: z.number().int().min(-200).max(200), y: z.number().int().min(-200).max(200) });

function control(state: CampaignState, refs: EntityRef[], ctx: CommandContext) {
  assertControl(state, refs, ctx);
}

const placement = z.object({ ref: entityRef, hex: hex.nullable() });

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
