/**
 * The outpost garden and the stables' pets, ported from GHS
 * src/app/ui/figures/party/buildings/garden/garden.ts and stables/stables.ts
 * (AGPL-3.0), plus passing a week by hand (GHS does this when a scenario
 * ends: weeks + 1 and the buildings' weekly step, e.g. the garden).
 */
import { Character } from '@fh/ghs-core';
import { herbResourceLootTypes, LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { PetIdentifier } from '@fh/ghs-core/vendor/game/model/data/PetCard';
import { GardenModel } from '@fh/ghs-core/vendor/game/model/Building';
import { z } from 'zod';
import { CommandError, defineCommand, type CommandDef, type Runtime } from '../runtime';
import { characterKey } from '../state';
import { partyCommands } from './party';

const herb = z.enum(herbResourceLootTypes as [LootType, ...LootType[]]);

function gardenBuilding(rt: Runtime) {
  const garden = rt.game.party.buildings.find((b) => b.name === 'garden' && b.level);
  if (!garden) throw new CommandError('The outpost has no garden');
  return garden;
}

/** Plots by garden level (GHS GardenComponent.update). */
export function gardenSlots(level: number): number {
  return level === 1 ? 1 : level < 4 ? 2 : 3;
}

function garden(rt: Runtime): GardenModel {
  return (rt.game.party.garden ??= new GardenModel());
}

function stables(rt: Runtime) {
  const model = rt.game.party.buildings.find((b) => b.name === 'stables' && b.level);
  if (!model) throw new CommandError('The outpost has no stables');
  return { active: model.level < 3 ? 1 : 2, capacity: 4 + Math.floor(model.level / 2) * 4 };
}

function pet(rt: Runtime, id: string, edition: string) {
  const model = rt.game.party.pets.find((p) => p.name === id && p.edition === edition);
  if (!model) throw new CommandError(`Pet ${id} isn't in the stables`);
  return model;
}

const petRef = z.object({ id: z.string(), edition: z.string().default('fh') });

const commands: CommandDef[] = [
  defineCommand({
    type: 'party.passWeek',
    payload: z.object({}),
    run(rt, _payload, ctx) {
      // The calendar logic (sections, conclusions) lives in party.setWeek.
      partyCommands.find((c) => c.type === 'party.setWeek')!.run(rt, { value: rt.game.party.weeks + 1 }, ctx);
      rt.gm.buildingsManager.nextWeek();
    }
  }),
  defineCommand({
    type: 'garden.plant',
    payload: z.object({ slot: z.number().int().min(0).max(2), herb, source: z.string().default('party') }),
    run(rt, { slot, herb: type, source }) {
      const building = gardenBuilding(rt);
      const g = garden(rt);
      if (rt.game.scenario) throw new CommandError('Plant between scenarios');
      if (slot >= gardenSlots(building.level)) throw new CommandError(`The garden has ${gardenSlots(building.level)} plot(s)`);
      if (building.level < 3 && g.flipped) throw new CommandError('Flip the garden back to its planting side first');
      if (g.plots[slot] === type) return;
      if (source === 'party') {
        if (!rt.game.party.loot[type]) throw new CommandError(`The outpost has no ${type}`);
        rt.gm.stateManager.before('buildings.garden.plant', type, slot);
        rt.game.party.loot[type] = (rt.game.party.loot[type] ?? 1) - 1;
      } else {
        const character = rt.game.figures.find((f): f is Character => f instanceof Character && characterKey(f) === source);
        if (!character) throw new CommandError('Unknown character', 'invalid_payload');
        if (!character.progress.loot[type]) throw new CommandError(`${rt.gm.characterManager.characterName(character)} has no ${type}`);
        rt.gm.stateManager.before('buildings.garden.plant', type, slot);
        character.progress.loot[type] = (character.progress.loot[type] ?? 1) - 1;
      }
      g.plots[slot] = type;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'garden.flip',
    payload: z.object({}),
    run(rt) {
      const building = gardenBuilding(rt);
      if (building.level >= 3) throw new CommandError('The garden no longer flips at level 3');
      const g = garden(rt);
      rt.gm.stateManager.before('buildings.garden.' + (g.flipped ? 'flipPlant' : 'flipHarvest'));
      g.flipped = !g.flipped;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'garden.toggleAutomation',
    payload: z.object({}),
    run(rt) {
      gardenBuilding(rt);
      const g = garden(rt);
      rt.gm.stateManager.before('buildings.garden.' + (g.automated ? 'automationOff' : 'automationOn'));
      g.automated = !g.automated;
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'garden.harvest',
    payload: z.object({}),
    run(rt) {
      gardenBuilding(rt);
      const g = garden(rt);
      if (!g.plots.length) throw new CommandError('Nothing is planted');
      rt.gm.stateManager.before('buildings.garden.harvest');
      g.plots.forEach((type) => (rt.game.party.loot[type] = (rt.game.party.loot[type] ?? 0) + 1));
      rt.gm.stateManager.after();
      rt.log(`Harvested ${g.plots.join(', ')}`);
    }
  }),
  defineCommand({
    type: 'pets.add',
    payload: petRef,
    run(rt, { id, edition }) {
      const s = stables(rt);
      const card = rt.gm.editionData.find((e) => e.edition === edition)?.pets?.find((p) => p.id === id);
      if (!card) throw new CommandError(`Unknown pet ${id}`, 'invalid_payload');
      if (rt.game.party.pets.some((p) => p.name === id && p.edition === edition)) throw new CommandError('That pet is already in the stables');
      if (rt.game.party.pets.length >= s.capacity) throw new CommandError(`The stables hold ${s.capacity} pets`);
      rt.gm.stateManager.before('buildings.stables.pets.add', edition, id);
      rt.game.party.pets.push(new PetIdentifier(id, edition));
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'pets.remove',
    payload: petRef,
    run(rt, { id, edition }) {
      pet(rt, id, edition);
      rt.gm.stateManager.before('buildings.stables.pets.remove', edition, id);
      rt.game.party.pets = rt.game.party.pets.filter((p) => p.name !== id || p.edition !== edition);
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'pets.rename',
    payload: petRef.extend({ petname: z.string().max(40) }),
    run(rt, { id, edition, petname }) {
      const model = pet(rt, id, edition);
      rt.gm.stateManager.before(petname ? 'buildings.stables.pets.setName' : 'buildings.stables.pets.unsetName', edition, id, petname);
      model.petname = petname.trim();
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'pets.toggleActive',
    payload: petRef,
    run(rt, { id, edition }) {
      const s = stables(rt);
      const model = pet(rt, id, edition);
      rt.gm.stateManager.before(model.active ? 'buildings.stables.pets.setInactive' : 'buildings.stables.pets.setActive', edition, id, model.petname);
      model.active = !model.active;
      while (rt.game.party.pets.filter((p) => p.active).length > s.active) {
        const other = rt.game.party.pets.find((p) => p.active && p !== model);
        if (!other) break;
        other.active = false;
      }
      rt.gm.stateManager.after();
    }
  }),
  defineCommand({
    type: 'pets.toggleLost',
    payload: petRef,
    run(rt, { id, edition }) {
      const model = pet(rt, id, edition);
      rt.gm.stateManager.before(model.lost ? 'buildings.stables.pets.restore' : 'buildings.stables.pets.play', edition, id);
      model.lost = !model.lost;
      rt.gm.stateManager.after();
    }
  })
];

export const gardenPetCommands = commands;
