/**
 * Guided retirement, ported from GHS
 * src/app/ui/figures/character/sheet/retirement-dialog.ts (AGPL-3.0).
 * character.retireStart works out what retiring does (with random draws
 * fixed), everyone sees it in ext.retirement, and character.retireConfirm
 * applies it. Conclusion sections are queued like other pending sections.
 */
import { Character, settingsManager } from '@fh/ghs-core';
import type { BuildingData } from '@fh/ghs-core/vendor/game/model/data/BuildingData';
import { CountIdentifier } from '@fh/ghs-core/vendor/game/model/data/Identifier';
import { resourceLootTypes } from '@fh/ghs-core/vendor/game/model/data/Loot';
import type { ScenarioData } from '@fh/ghs-core/vendor/game/model/data/ScenarioData';
import type { ItemData } from '@fh/ghs-core/vendor/game/model/data/ItemData';
import { BuildingModel } from '@fh/ghs-core/vendor/game/model/Building';
import { GameScenarioModel } from '@fh/ghs-core/vendor/game/model/Scenario';
import { z } from 'zod';
import { CommandError, defineCommand, type CommandDef, type Runtime } from '../runtime';
import { characterKey, type ItemRef, type RetirementDraft, type ScenarioRef } from '../state';
import { assertOwner, characterCommand, name } from './character';
import { queueConclusion } from './party';

/** GHS buildingsEnvelopeHelper: the envelope's building that isn't in the outpost yet. */
function envelopeBuilding(rt: Runtime, envelope: string, both = true): BuildingData | undefined {
  const data = rt.gm.campaignManager.campaignData().buildings ?? [];
  const buildings = envelope
    .split(':')
    .map((id) => data.find((b) => b.id === id))
    .filter((b): b is BuildingData => !!b);
  const has = (b: BuildingData) => rt.game.party.buildings.some((m) => m.name === b.name);
  if (buildings[0] && !has(buildings[0])) return buildings[0];
  if (both && buildings[1] && !has(buildings[1])) return buildings[1];
  return undefined;
}

const scenarioRef = (s: ScenarioData): ScenarioRef => ({ index: s.index, edition: s.edition, ...(s.group ? { group: s.group } : {}) });
const itemRef = (i: ItemData): ItemRef => ({ id: i.id, edition: i.edition });

function draftFor(rt: Runtime, c: Character): RetirementDraft {
  const draft: RetirementDraft = { character: characterKey(c), conclusions: [], alreadyRetired: false };
  const pq = c.progress.personalQuest ? rt.gm.personalQuestManager.personalQuestByCard(rt.gm.currentEdition(), c.progress.personalQuest) : undefined;
  let skipCharacterConclusion = false;
  if (pq) {
    draft.personalQuest = pq.cardId;
    const pqConclusion = rt.gm.sectionData(pq.edition).find((s) => s.retirement === 'PQ-' + pq.cardId && s.conclusion);
    if (pqConclusion) {
      skipCharacterConclusion = pqConclusion.rewards?.characterRetirementSkipEvents !== undefined;
    }
    if (!skipCharacterConclusion) {
      const conclusion = rt.gm.sectionData(c.edition).find((s) => s.retirement === c.name && s.conclusion);
      if (conclusion) draft.conclusions.push({ section: conclusion.index, edition: conclusion.edition, reason: `${c.name} retired` });
    }
    if (pqConclusion) draft.conclusions.push({ section: pqConclusion.index, edition: pqConclusion.edition, reason: `personal quest ${pq.cardId}` });

    const fhQuest = !!pq.openEnvelope && rt.gm.fhRules();
    const scenarios = fhQuest ? rt.gm.scenarioManager.drawRandomScenarioSectionsBatch(pq.edition, 2) : rt.gm.scenarioManager.drawRandomScenariosBatch(pq.edition, 2);
    const items = rt.gm.itemManager.drawRandomItemsBatch(pq.edition, 2, fhQuest);
    const scenario = () => {
      const next = scenarios.pop();
      return next ? (settingsManager.settings.drawRandomScenario ? scenarioRef(next) : ('manual' as const)) : undefined;
    };
    const item = () => {
      const next = items.pop();
      return next ? (settingsManager.settings.drawRandomItem ? itemRef(next) : ('manual' as const)) : undefined;
    };

    if (pq.unlockCharacter) {
      const key = pq.edition + ':' + pq.unlockCharacter;
      if (!rt.game.unlockedCharacters.includes(key)) {
        draft.unlockCharacter = key;
        const data = rt.gm.charactersData(pq.edition).find((d) => d.edition === pq.edition && d.name === pq.unlockCharacter);
        if (data?.unlockEvent) draft.unlockEvent = data.unlockEvent;
      } else {
        draft.characterReward = { ...optional('scenario', scenario()), ...optional('item', item()) };
      }
    }
    if (pq.unlockPQ) draft.unlockPQ = pq.unlockPQ;
    if (fhQuest) {
      const building = settingsManager.settings.unlockEnvelopeBuildings ? envelopeBuilding(rt, pq.openEnvelope) : undefined;
      if (building) draft.envelopeBuilding = building.name;
      if (!envelopeBuilding(rt, pq.openEnvelope, false) && !envelopeBuilding(rt, pq.openEnvelope)) {
        draft.envelopeReward = { ...optional('section', scenario()), ...optional('item', item()) };
      }
    }
  } else {
    const conclusion = rt.gm.sectionData(c.edition).find((s) => s.retirement === c.name && s.conclusion);
    if (conclusion) draft.conclusions.push({ section: conclusion.index, edition: conclusion.edition, reason: `${c.name} retired` });
  }
  draft.alreadyRetired = rt.game.party.retirements.some((r) => r.edition === c.edition && r.name === c.name);
  return draft;
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/** GHS addUnlockEvents. */
function addUnlockEvents(rt: Runtime, events: string | undefined) {
  if (!settingsManager.settings.events || !events) return;
  for (const event of events.split('|')) {
    const [type, cardId] = event.split(':');
    if (cardId) {
      rt.gm.eventCardManager.addEvent(type!, cardId, true);
    } else {
      rt.gm.eventCardManager.addEvent('city', event, true);
      rt.gm.eventCardManager.addEvent('road', event, true);
    }
  }
}

const commands: CommandDef[] = [
  characterCommand('character.retireStart', {}, (rt, c) => {
    if (rt.ext.retirement) throw new CommandError('Another retirement is being reviewed');
    if (!rt.game.party.campaignMode) throw new CommandError('Guided retirement needs campaign mode');
    rt.ext.retirement = draftFor(rt, c);
  }),
  defineCommand({
    type: 'character.retireCancel',
    payload: z.object({}),
    run(rt) {
      delete rt.ext.retirement;
    }
  }),
  defineCommand({
    type: 'character.retireConfirm',
    payload: z.object({ moveResources: z.boolean().default(true) }),
    authorize(state, _payload, ctx) {
      const key = state.ext.retirement?.character;
      if (key) {
        const [edition = '', characterName = ''] = key.split(':');
        assertOwner(state, { edition, name: characterName }, ctx);
      }
    },
    run(rt, { moveResources }) {
      const draft = rt.ext.retirement;
      if (!draft) throw new CommandError('No retirement to confirm');
      const c = rt.game.figures.find((f): f is Character => f instanceof Character && characterKey(f) === draft.character);
      if (!c) throw new CommandError(`${draft.character} isn't in the party`);
      const party = rt.game.party;
      const automatic = settingsManager.settings.automaticUnlocking;

      rt.gm.stateManager.before('setRetired', name(rt, c));
      if (moveResources) {
        for (const type of resourceLootTypes) {
          if (c.progress.loot[type]) {
            party.loot[type] = (party.loot[type] || 0) + (c.progress.loot[type] || 0);
            c.progress.loot[type] = 0;
          }
        }
      }
      c.progress.retired = true;
      party.retirements.push(c.toModel());
      rt.gm.characterManager.removeCharacter(c, true);

      if (draft.unlockCharacter && automatic && !rt.game.unlockedCharacters.includes(draft.unlockCharacter)) {
        rt.game.unlockedCharacters.push(draft.unlockCharacter);
        addUnlockEvents(rt, draft.unlockEvent);
        rt.log(`Unlocked ${draft.unlockCharacter.split(':')[1]}`);
      }
      if (draft.unlockPQ && automatic) {
        const pq = rt.gm.personalQuestManager.personalQuestByCard(rt.gm.currentEdition(), draft.personalQuest ?? '');
        rt.gm.personalQuestManager.unlockPersonalQuest(pq?.edition ?? rt.gm.currentEdition(), draft.unlockPQ);
      }
      const reward = draft.characterReward;
      if (reward) {
        if (reward.scenario && reward.scenario !== 'manual') {
          party.manualScenarios.push(new GameScenarioModel(reward.scenario.index, reward.scenario.edition, reward.scenario.group ?? ''));
        }
        if (reward.item && reward.item !== 'manual') party.unlockedItems.push(new CountIdentifier(reward.item.id, reward.item.edition));
        if (reward.scenario === 'manual' || reward.item === 'manual') rt.log('Draw a random scenario and item design from the box');
      }
      const envelope = draft.envelopeReward;
      if (envelope) {
        if (envelope.section && envelope.section !== 'manual') {
          const section = envelope.section;
          party.conclusions.push(new GameScenarioModel(section.index, section.edition, section.group ?? ''));
          rt.gm.sectionData(section.edition)
            .find((s) => s.index === section.index)
            ?.unlocks?.forEach((unlock) => party.manualScenarios.push(new GameScenarioModel(unlock, section.edition)));
        } else if (!envelope.section) {
          party.inspiration += 1;
        }
        if (envelope.item && envelope.item !== 'manual') {
          party.unlockedItems.push(new CountIdentifier(envelope.item.id, envelope.item.edition));
        } else if (!envelope.item) {
          party.inspiration += 1;
        }
        if (envelope.section === 'manual' || envelope.item === 'manual') rt.log('Draw a random section and item blueprint from the box');
      }
      if (draft.envelopeBuilding && settingsManager.settings.unlockEnvelopeBuildings && !party.buildings.some((b) => b.name === draft.envelopeBuilding)) {
        party.buildings.push(new BuildingModel(draft.envelopeBuilding, 0));
      }
      rt.gm.stateManager.after();

      for (const conclusion of draft.conclusions) {
        if (!party.conclusions.some((m) => m.edition === conclusion.edition && m.index === conclusion.section)) {
          queueConclusion(rt, conclusion.section, conclusion.reason);
        }
      }
      rt.log(`${draft.character.split(':')[1]} retired`);
      delete rt.ext.retirement;
    }
  })
];

export const retirementCommands = commands;
