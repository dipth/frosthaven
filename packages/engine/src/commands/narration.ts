/** Forteller narration cues (see narration.ts): who narrates, dismissing and replaying cues. */
import { z } from 'zod';
import { addCues, narrationCue } from '../narration';
import { RULE_DEFAULTS } from '../rules';
import { CommandError, defineCommand, type CommandDef } from '../runtime';

const commands: CommandDef[] = [
  defineCommand({
    type: 'narration.setNarrator',
    payload: z.object({ userId: z.string().nullable() }),
    run(rt, { userId }) {
      if (userId) rt.ext.narratorUserId = userId;
      else delete rt.ext.narratorUserId;
    }
  }),
  defineCommand({
    type: 'narration.dismiss',
    payload: z.object({ id: z.string().optional() }),
    authorize(state, _payload, ctx) {
      if (state.ext.narratorUserId && state.ext.narratorUserId !== ctx.userId && !ctx.isAdmin) {
        throw new CommandError('Only the narrator dismisses cues', 'forbidden');
      }
    },
    run(rt, { id }) {
      rt.ext.narration = id ? rt.ext.narration?.filter((cue) => cue.id !== id) : [];
      if (!rt.ext.narration?.length) delete rt.ext.narration;
    }
  }),
  defineCommand({
    type: 'narration.cue',
    payload: z.object({ kind: z.enum(['scenario-intro', 'scenario-conclusion', 'section', 'event']), ref: z.string().min(1).max(40) }),
    run(rt, { kind, ref }) {
      const name = kind.startsWith('scenario') ? rt.gm.scenarioData(rt.gm.currentEdition()).find((s) => s.index === ref && !s.group)?.name : undefined;
      addCues(rt.ext, [narrationCue(kind, ref, name)]);
    }
  })
];

export const narrationCommands = commands;

/** Per-campaign GHS rule settings (see rules.ts). */
export const ruleCommands: CommandDef[] = [
  defineCommand({
    type: 'campaign.setRule',
    payload: z.object({ key: z.enum(Object.keys(RULE_DEFAULTS) as [keyof typeof RULE_DEFAULTS, ...(keyof typeof RULE_DEFAULTS)[]]), value: z.boolean() }),
    authorize(_state, _payload, ctx) {
      if (!ctx.isAdmin) throw new CommandError('Only the admin changes campaign rules', 'forbidden');
    },
    run(rt, { key, value }) {
      if (typeof RULE_DEFAULTS[key] !== 'boolean') throw new CommandError(`${key} isn't an on/off rule`, 'invalid_payload');
      rt.ext.rules = { ...rt.ext.rules, [key]: value };
      rt.log(`Rule ${key} ${value ? 'on' : 'off'}`);
    }
  })
];
