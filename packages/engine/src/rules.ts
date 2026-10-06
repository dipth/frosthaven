/**
 * GHS settings that change game logic (as opposed to display). Kept per
 * campaign in ext.rules and applied to the GHS runtime before each command on
 * the server and before rendering on the client, so both behave the same.
 * Defaults match the group's Secretariat configuration; imports copy the
 * values from the dump's settings.
 */
import { settingsManager } from '@fh/ghs-core';

export const RULE_DEFAULTS = {
  applyLoot: true,
  applyLootRandomItem: true,
  applyConditions: true,
  applyConditionsExcludes: ['shield'] as string[],
  activeApplyConditions: true,
  scenarioRules: true,
  scenarioRulesAutoapply: false,
  automaticPassTime: true,
  automaticUnlocking: true,
  applyBuildingRewards: true,
  applyRetirement: true,
  calculate: true,
  calculateStats: true,
  characterItems: true,
  characterSheet: true,
  scenarioRewards: true,
  scenarioStats: false,
  randomStandees: false,
  automaticStandees: true,
  activeStandees: true,
  activeSummons: true,
  initiativeRequired: true,
  sortFigures: true,
  moveElements: true,
  removeUnusedMonster: true,
  drawRandomItem: true,
  drawRandomScenario: true,
  battleGoals: false,
  lootDeck: true,
  partySheet: true,
  fhShareResources: false,
  fhSecondEdition: false,
  events: true,
  eventsDraw: true,
  eventsApply: true,
  unlockEnvelopeBuildings: true,
  fhChallenges: false,
  fhChallengesApply: true,
  fhTrials: false,
  fhTrialsApply: true,
  fhGarden: true,
  fhPets: true,
  temporaryEnhancements: false,
  expireConditions: true,
  applyLongRest: true,
  scenarioRooms: true,
  abilities: true,
  abilityReveal: true
};

export type CampaignRules = Partial<typeof RULE_DEFAULTS>;

/** Picks the logic-relevant settings from a GHS settings object. */
export function rulesFromGhsSettings(settings: Record<string, unknown> | undefined): CampaignRules {
  const rules: Record<string, unknown> = {};
  if (settings) {
    for (const key of Object.keys(RULE_DEFAULTS)) {
      if (key in settings) {
        rules[key] = settings[key];
      }
    }
  }
  // Tracking event decks is a core feature of this app (physical sync), even
  // when the group had it switched off in Secretariat.
  rules['events'] = true;
  return rules as CampaignRules;
}

export function applyRules(rules: CampaignRules | undefined) {
  Object.assign(settingsManager.settings, RULE_DEFAULTS, rules ?? {});
}

/**
 * Rules in effect for the current play session. Online, the app draws
 * monster standee numbers (there is no physical bag to draw from).
 */
export function sessionRules(ext: { rules?: CampaignRules | undefined; mode?: string }): CampaignRules {
  return ext.mode === 'online' ? { ...ext.rules, randomStandees: true } : (ext.rules ?? {});
}
