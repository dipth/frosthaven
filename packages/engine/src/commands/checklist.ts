/** Ticking off physical sync checklist items (see checklist.ts). */
import { z } from 'zod';
import { defineCommand, type CommandDef } from '../runtime';

const commands: CommandDef[] = [
  defineCommand({
    type: 'checklist.tick',
    payload: z.object({ id: z.string().max(200), done: z.boolean() }),
    run(rt, { id, done }) {
      const ticks = new Set(rt.ext.checklistTicks ?? []);
      if (done) ticks.add(id);
      else ticks.delete(id);
      rt.ext.checklistTicks = [...ticks];
    }
  })
];

export const checklistCommands = commands;
