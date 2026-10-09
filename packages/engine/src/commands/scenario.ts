import { z } from 'zod';
import { Scenario } from '@fh/ghs-core/vendor/game/model/Scenario';
import { CommandError, defineCommand, type CommandDef, type Runtime } from '../runtime';

/** Online mode: a (re)started scenario begins with an empty map and fresh hands. */
function clearOnlineScenario(rt: Runtime) {
  delete rt.ext.board;
  delete rt.ext.hands;
}

const scenarioSet = defineCommand({
  type: 'scenario.set',
  payload: z.object({ edition: z.string().default('fh'), index: z.string(), group: z.string().optional() }),
  run(rt, { edition, index, group }) {
    const data = rt.gm.scenarioManager
      .scenarioData(edition, true)
      .find((s) => s.index === index && (s.group ?? undefined) === group);
    if (!data) {
      throw new CommandError(`Unknown scenario ${edition} #${index}`, 'invalid_payload');
    }
    rt.gm.stateManager.before('setScenario', ...rt.gm.scenarioManager.scenarioUndoArgs(new Scenario(data)));
    rt.gm.scenarioManager.setScenario(data as Scenario);
    clearOnlineScenario(rt);
    rt.gm.stateManager.after();
  }
});

const scenarioReset = defineCommand({
  type: 'scenario.reset',
  payload: z.object({}),
  run(rt) {
    if (!rt.game.scenario) {
      throw new CommandError('No scenario in progress');
    }
    rt.gm.stateManager.before('resetScenario', ...rt.gm.scenarioManager.scenarioUndoArgs());
    rt.gm.roundManager.resetScenario();
    rt.gm.scenarioManager.setScenario(rt.game.scenario);
    clearOnlineScenario(rt);
    rt.gm.stateManager.after();
  }
});

export const scenarioCommands: CommandDef[] = [scenarioSet, scenarioReset];
