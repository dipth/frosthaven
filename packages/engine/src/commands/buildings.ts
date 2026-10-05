/**
 * Outpost building bookkeeping, ported from GHS
 * src/app/ui/figures/party/buildings (AGPL-3.0). building.construct, rebuild,
 * repair and party.recruitSoldier pay from the outpost supply and the
 * characters; building.upgrade and setState record buildings as they are on
 * the physical outpost map ("already paid").
 */
import { settingsManager } from '@fh/ghs-core';
import type { BuildingData } from '@fh/ghs-core/vendor/game/model/data/BuildingData';
import { PersonalQuestAutotrackType } from '@fh/ghs-core/vendor/game/model/data/PersonalQuest';
import { BuildingModel } from '@fh/ghs-core/vendor/game/model/Building';
import {
  applyPayment,
  buildingStep,
  carpenterDiscount,
  paymentProblems,
  SOLDIER_COSTS,
  soldierCapacity,
  type Costs,
  type Payment
} from '../ghs-ui/buildings';
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

const materials = z.number().int().min(0).max(99);
const paymentSchema = z.object({
  party: z.object({ lumber: materials, metal: materials, hide: materials, inspiration: materials }),
  characters: z.array(z.object({ character: z.string(), gold: materials, lumber: materials, metal: materials, hide: materials }))
});

/** Throws unless the payment covers the costs. */
function pay(costs: Costs, discount: boolean, payment: Payment) {
  const problems = paymentProblems(costs, discount, payment);
  if (problems.length) {
    throw new CommandError(problems.join('; '));
  }
}

/** One level up, with rewards (GHS buildings-list upgrade()). */
function levelUp(rt: Runtime, data: BuildingData, model: BuildingModel) {
  model.level++;
  rt.gm.personalQuestManager.trackPersonalQuestProgressForParty(PersonalQuestAutotrackType.buildings);
  const rewards = data.rewards?.[model.level - 1];
  if (rt.game.party.campaignMode && settingsManager.settings.applyBuildingRewards && rewards) {
    rt.gm.buildingsManager.applyRewards(rewards);
    if (rewards.section) {
      queueConclusion(rt, rewards.section, `${data.name} level ${model.level}`);
    }
  }
}

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
      levelUp(rt, data, model);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'building.construct',
    payload: named.extend({ payment: paymentSchema }),
    run(rt, { name, payment }) {
      const data = buildingData(rt, name);
      const model = buildingModel(rt, data.name);
      const step = buildingStep(model, data);
      if (!step || (step.action !== 'build' && step.action !== 'upgrade')) {
        throw new CommandError(`${data.name} can't be ${model.level ? 'upgraded' : 'built'} now`);
      }
      if (step.manual) {
        throw new CommandError(`${data.name} is upgraded through the campaign, not bought`);
      }
      pay(step.costs, carpenterDiscount(), payment);
      rt.gm.stateManager.before(model.level ? 'upgradeBuilding' : 'buildBuilding', data.id, model.name, model.level + 1);
      applyPayment(payment);
      levelUp(rt, data, model);
      rt.gm.stateManager.after();
      rt.log(`${step.action === 'build' ? 'Built' : 'Upgraded'} ${data.name} (level ${model.level})`);
    }
  }),
  defineCommand({
    type: 'building.rebuild',
    payload: named.extend({ payment: paymentSchema }),
    run(rt, { name, payment }) {
      const data = buildingData(rt, name);
      const model = buildingModel(rt, data.name);
      const step = buildingStep(model, data);
      if (step?.action !== 'rebuild') {
        throw new CommandError(`${data.name} isn't wrecked`);
      }
      pay(step.costs, carpenterDiscount(), payment);
      rt.gm.stateManager.before('rebuildBuilding', data.id, model.name);
      applyPayment(payment);
      model.state = 'normal';
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'building.repair',
    payload: named.extend({ payment: paymentSchema.optional(), morale: z.boolean().default(false) }),
    run(rt, { name, payment, morale }) {
      const data = buildingData(rt, name);
      const model = buildingModel(rt, data.name);
      const step = buildingStep(model, data);
      if (step?.action !== 'repair') {
        throw new CommandError(`${data.name} isn't damaged`);
      }
      if (morale) {
        if (rt.game.party.morale < 1) throw new CommandError('No morale to spend');
      } else {
        if (!payment) throw new CommandError('Pay with materials or morale', 'invalid_payload');
        pay(step.costs, false, payment);
      }
      rt.gm.stateManager.before('repairBuilding', data.id, data.name);
      if (morale) {
        rt.gm.campaignManager.changeMorale(-1);
      } else {
        applyPayment(payment!);
      }
      model.state = 'normal';
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'party.recruitSoldier',
    payload: z.object({ payment: paymentSchema }),
    run(rt, { payment }) {
      if (rt.game.party.campaignMode && rt.game.party.soldiers >= soldierCapacity()) {
        throw new CommandError(soldierCapacity() ? 'The barracks are full' : 'Recruiting needs working barracks');
      }
      pay(SOLDIER_COSTS, false, payment);
      rt.gm.stateManager.before('setPartySoldiers', rt.game.party.soldiers + 1);
      applyPayment(payment);
      rt.game.party.soldiers++;
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
