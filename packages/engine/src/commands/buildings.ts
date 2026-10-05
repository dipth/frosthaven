/**
 * Outpost building bookkeeping, ported from GHS
 * src/app/ui/figures/party/buildings (AGPL-3.0). Paying construction costs from
 * resources belongs to the outpost phase; these commands record buildings as
 * they are on the physical outpost map ("already paid").
 */
import { BuildingModel } from '@fh/ghs-core/vendor/game/model/Building';
import { z } from 'zod';
import { CommandError, defineCommand, type CommandDef, type Runtime } from '../runtime';
import { queueConclusion } from './party';

function buildingData(rt: Runtime, name: string) {
  const data = rt.gm.campaignManager.campaignData().buildings?.find((b) => b.name === name || b.id === name);
  if (!data) {
    throw new CommandError(`Unknown building ${name}`, 'invalid_payload');
  }
  return data;
}

function buildingModel(rt: Runtime, name: string) {
  const model = rt.game.party.buildings.find((b) => b.name === name);
  if (!model) {
    throw new CommandError(`The outpost has no ${name}`);
  }
  return model;
}

/** Removes the conclusion granted by a building level's reward section (GHS downgrade). */
function revokeRewardSection(rt: Runtime, section: string | undefined) {
  if (!section) {
    return;
  }
  const sectionData = rt.gm.sectionData(rt.gm.currentEdition()).find((s) => s.index === section);
  const conclusion = sectionData && rt.gm.buildingsManager.rewardSection(sectionData);
  if (conclusion) {
    rt.game.party.conclusions = rt.game.party.conclusions.filter(
      (m) => m.edition !== conclusion.edition || m.group !== conclusion.group || m.index !== conclusion.index
    );
  }
}

const named = z.object({ name: z.string() });

const commands: CommandDef[] = [
  defineCommand({
    type: 'building.add',
    payload: named,
    run(rt, { name }) {
      const data = buildingData(rt, name);
      if (rt.game.party.buildings.some((b) => b.name === data.name)) {
        throw new CommandError(`The outpost already has ${data.name}`);
      }
      rt.gm.stateManager.before('addBuilding', data.id, data.name);
      rt.game.party.buildings.push(new BuildingModel(data.name, 0));
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'building.upgrade',
    payload: named,
    run(rt, { name }) {
      const data = buildingData(rt, name);
      const model = buildingModel(rt, data.name);
      if (model.level >= (data.upgrades?.length ?? 0) + 1) {
        throw new CommandError(`${data.name} is already at its highest level`);
      }
      rt.gm.stateManager.before(model.level ? 'upgradeBuilding' : 'buildBuilding', data.id, model.name, model.level + 1);
      model.level++;
      const rewards = data.rewards?.[model.level - 1];
      if (rt.game.party.campaignMode && rewards) {
        rt.gm.buildingsManager.applyRewards(rewards);
        if (rewards.section) {
          queueConclusion(rt, rewards.section, `${data.name} level ${model.level}`);
        }
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'building.downgrade',
    payload: named,
    run(rt, { name }) {
      const data = buildingData(rt, name);
      const model = buildingModel(rt, data.name);
      const removable = !rt.gm.buildingsManager.initialBuilding(data) && !rt.gm.buildingsManager.availableBuilding(data);
      if (model.level === 0 || (model.level === 1 && removable)) {
        if (!removable) {
          throw new CommandError(`${data.name} can't be removed from the outpost`);
        }
        rt.gm.stateManager.before('removeBuilding', data.id, model.name);
        rt.game.party.buildings.splice(rt.game.party.buildings.indexOf(model), 1);
        if (rt.game.party.campaignMode) {
          revokeRewardSection(rt, data.rewards?.[0]?.section);
        }
      } else {
        rt.gm.stateManager.before('downgradeBuilding', data.id, model.name, model.level - 1);
        model.level--;
        if (model.level === 0) {
          model.state = 'normal';
        }
        if (rt.game.party.campaignMode) {
          revokeRewardSection(rt, data.rewards?.[model.level]?.section);
        }
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'building.setState',
    payload: named.extend({ state: z.enum(['normal', 'damaged', 'wrecked']) }),
    run(rt, { name, state }) {
      const data = buildingData(rt, name);
      const model = buildingModel(rt, data.name);
      if (!data.repair || model.level === 0) {
        throw new CommandError(`${data.name} can't be damaged`);
      }
      const key = state === 'normal' ? (model.state === 'wrecked' ? 'rebuildBuilding' : 'repairBuilding') : 'changeBuildingState';
      if (key === 'changeBuildingState') {
        rt.gm.stateManager.before(key, data.id, model.name, state);
      } else {
        rt.gm.stateManager.before(key, data.id, model.name);
      }
      model.state = state;
      rt.gm.stateManager.after();
    }
  })
];

export const buildingCommands = commands;
