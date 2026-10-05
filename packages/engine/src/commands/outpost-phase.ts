/**
 * The Frosthaven outpost phase as a shared, step-by-step flow: passage of
 * time, outpost event, building operations, downtime, construction. Each
 * step's actions are the regular commands (party.setWeek, eventDraw.*,
 * item.*, building.*); this only tracks where the group is.
 */
import { z } from 'zod';
import { CommandError, defineCommand, type CommandDef } from '../runtime';
import { OUTPOST_PHASE_STEPS } from '../state';

const commands: CommandDef[] = [
  defineCommand({
    type: 'outpostPhase.start',
    payload: z.object({}),
    run(rt) {
      if (rt.game.scenario) throw new CommandError('Finish the scenario first');
      if (rt.ext.outpostPhase) throw new CommandError('The outpost phase is already running');
      rt.ext.outpostPhase = { step: 'passage-of-time', startWeek: rt.game.party.weeks };
      rt.log('Outpost phase started');
    }
  }),
  defineCommand({
    type: 'outpostPhase.setStep',
    payload: z.object({ step: z.enum(OUTPOST_PHASE_STEPS) }),
    run(rt, { step }) {
      if (!rt.ext.outpostPhase) throw new CommandError('No outpost phase is running');
      rt.ext.outpostPhase.step = step;
    }
  }),
  defineCommand({
    type: 'outpostPhase.finish',
    payload: z.object({}),
    run(rt) {
      if (!rt.ext.outpostPhase) return;
      delete rt.ext.outpostPhase;
      rt.log('Outpost phase finished');
    }
  })
];

export const outpostPhaseCommands = commands;
