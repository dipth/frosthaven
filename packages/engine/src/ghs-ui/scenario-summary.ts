/**
 * Headless port of GHS src/app/ui/footer/scenario/summary/scenario-summary.ts
 * (AGPL-3.0): the scenario-finish dialog. GHS keeps the dialog's choices in
 * game.finish so every client sees the same draft; we do the same, rebuilding
 * this object from game.finish for each command. Dialog-only code (opening
 * other dialogs, animations) is dropped; method bodies are otherwise kept close
 * to the original so behaviour matches Secretariat.
 */
import { Character, gameManager, settingsManager } from '@fh/ghs-core';
import { additionalTownGuardAttackModifier, AttackModifier } from '@fh/ghs-core/vendor/game/model/data/AttackModifier';
import { CountIdentifier, Identifier } from '@fh/ghs-core/vendor/game/model/data/Identifier';
import type { ItemData } from '@fh/ghs-core/vendor/game/model/data/ItemData';
import { LootType } from '@fh/ghs-core/vendor/game/model/data/Loot';
import { PersonalQuestAutotrackType } from '@fh/ghs-core/vendor/game/model/data/PersonalQuest';
import { ScenarioFinish, ScenarioRewards, type ScenarioData } from '@fh/ghs-core/vendor/game/model/data/ScenarioData';
import { EntityValueFunction } from '@fh/ghs-core/vendor/game/model/Entity';
import { GameScenarioModel, Scenario } from '@fh/ghs-core/vendor/game/model/Scenario';

export class ScenarioSummary {
  scenario: Scenario;
  conclusion: ScenarioData | undefined;
  success: boolean;
  characterProgress: boolean = true;
  gainRewards: boolean = true;
  forceCampaign: boolean = false;
  conclusionOnly: boolean;
  rewardsOnly: boolean;

  characters: Character[];
  battleGoals: number[] = [];
  collectiveGold: number[] = [];
  collectiveResources: Partial<Record<LootType, number>>[] = [];
  rewardItems: ItemData[] = [];
  rewardItemCount: number[] = [];
  items: number[][] = [];
  chooseLocation: string | undefined;
  chooseUnlockCharacter: string | undefined;
  rewards: ScenarioRewards | undefined = undefined;
  challenges: number = 0;
  numberChallenges: number = 0;
  calendarSectionManual: number[] = [];
  randomItem: ItemData | undefined;
  randomItemIndex: number = -1;
  randomItems: (ItemData | undefined)[] = [];
  randomItemBlueprints: number[] = [];
  randomItemDesigns: number[] = [];
  randomSideScenario: ScenarioData | undefined;
  trials: boolean[] = [];
  overlayCustomText: string = '';
  townGuardAMs: AttackModifier[] = [];
  levelUp: boolean[] = [];
  perksUp: boolean[] = [];

  constructor(data: { scenario: Scenario; success: boolean; conclusion: ScenarioData | undefined; conclusionOnly?: boolean; rewardsOnly?: boolean }) {
    this.scenario = data.scenario;
    this.success = data.success;
    this.conclusion = data.conclusion;
    this.conclusionOnly = !!data.conclusionOnly;
    this.rewardsOnly = !!data.rewardsOnly;
    if (this.conclusionOnly) {
      this.conclusion = this.scenario;
      this.success = true;
      gameManager.game.finish = undefined;
      if (
        this.conclusion.repeatable ||
        gameManager.game.party.conclusions.find(
          (conclusion) =>
            conclusion.index === this.scenario.index && conclusion.edition === this.scenario.edition && conclusion.group === this.scenario.group
        )
      ) {
        this.rewardsOnly = true;
      }
    }

    if (this.conclusion) {
      const existingModel = gameManager.game.party.conclusions.find(
        (m) => m.index === this.conclusion!.index && m.edition === this.conclusion!.edition && m.group === this.conclusion!.group
      );
      if (existingModel && existingModel.custom) {
        this.overlayCustomText = existingModel.custom;
      }
    }

    this.characters = gameManager.game.figures
      .filter((figure) => figure instanceof Character)
      .map((figure, index) => {
        this.battleGoals[index] = 0;
        return figure as Character;
      })
      .sort((a, b) => {
        if (!a.absent && b.absent) return -1;
        if (a.absent && !b.absent) return 1;
        const aName = gameManager.characterManager.characterName(a).toLowerCase();
        const bName = gameManager.characterManager.characterName(b).toLowerCase();
        return aName > bName ? 1 : aName < bName ? -1 : 0;
      });

    this.characterProgress = !this.rewardsOnly && !this.conclusionOnly && (gameManager.game.party.campaignMode || !gameManager.fhRules(true));
    this.gainRewards = gameManager.game.party.campaignMode;
  }

  /** Opens the dialog: creates game.finish, or loads the existing draft. */
  static open(data: ConstructorParameters<typeof ScenarioSummary>[0]): ScenarioSummary {
    const summary = new ScenarioSummary(data);
    summary.updateState(summary.rewardsOnly);
    if (!gameManager.game.finish && !summary.conclusionOnly && !summary.rewardsOnly) {
      summary.updateFinish();
    } else if (!summary.rewardsOnly) {
      summary.loadFinish();
    }
    return summary;
  }

  /** Rebuilds the open dialog from game.finish (what other GHS clients do). */
  static fromGame(): ScenarioSummary | undefined {
    const finish = gameManager.game.finish;
    const scenario = gameManager.game.scenario;
    if (!finish || !scenario) {
      return undefined;
    }
    const summary = new ScenarioSummary({ scenario, success: finish.success, conclusion: undefined });
    summary.loadFinish();
    return summary;
  }

  updateFinish() {
    const finish = new ScenarioFinish();
    finish.conclusion = this.conclusion ? new GameScenarioModel(this.conclusion.index, this.conclusion.edition, this.conclusion.group) : undefined;
    finish.success = this.success;
    finish.battleGoals = this.battleGoals;
    finish.challenges = this.challenges;
    finish.chooseLocation = this.chooseLocation;
    finish.chooseUnlockCharacter = this.chooseUnlockCharacter;
    finish.collectiveGold = this.collectiveGold;
    finish.collectiveResources = this.collectiveResources || [];
    finish.items = this.items;
    finish.calendarSectionManual = this.calendarSectionManual;
    finish.randomItem = this.randomItem ? new Identifier(this.randomItem.id, this.randomItem.edition) : undefined;
    finish.randomItemIndex = this.randomItemIndex;
    finish.randomItems = this.randomItems ? this.randomItems.map((itemData) => (itemData ? new Identifier(itemData.id, itemData.edition) : undefined)) : [];
    finish.randomItemBlueprints = this.randomItemBlueprints;
    finish.randomItemDesigns = this.randomItemDesigns;
    finish.randomSideScenario = this.randomSideScenario ? new Identifier(this.randomSideScenario.index, this.randomSideScenario.edition) : undefined;
    finish.trials = this.trials;
    finish.overlayCustomText = this.overlayCustomText;
    gameManager.game.finish = finish;
    this.updateState();
  }

  loadFinish() {
    if (gameManager.game.finish) {
      const finish = gameManager.game.finish;
      this.conclusion = finish.conclusion
        ? gameManager
            .sectionData(finish.conclusion.edition)
            .find(
              (sectionData) =>
                finish.conclusion && sectionData.index === finish.conclusion.index && sectionData.group === finish.conclusion.group && sectionData.conclusion
            )
        : undefined;
      this.success = finish.success;
      this.battleGoals = finish.battleGoals || [];
      this.challenges = finish.challenges;
      this.chooseLocation = finish.chooseLocation;
      this.chooseUnlockCharacter = finish.chooseUnlockCharacter;
      this.collectiveGold = finish.collectiveGold || [];
      this.collectiveResources = finish.collectiveResources || [];
      this.items = finish.items;
      this.calendarSectionManual = finish.calendarSectionManual || finish.calenderSectionManual;
      this.randomItem = finish.randomItem ? gameManager.itemManager.getItem(finish.randomItem.name, finish.randomItem.edition, true) : undefined;
      this.randomItemIndex = finish.randomItemIndex;
      this.randomItems = finish.randomItems ? finish.randomItems.map((item) => (item ? gameManager.itemManager.getItem(item.name, item.edition, true) : undefined)) : [];
      this.randomItemBlueprints = finish.randomItemBlueprints || [];
      this.randomItemDesigns = finish.randomItemDesigns || [];
      this.randomSideScenario = finish.randomSideScenario
        ? gameManager.scenarioManager.getScenario(finish.randomSideScenario.name, finish.randomSideScenario.edition, this.scenario.group)
        : undefined;
      this.trials = finish.trials || [];
      this.overlayCustomText = finish.overlayCustomText || '';
      this.updateState();
    }
  }

  updateState(forceCampaign: boolean = false): void {
    this.forceCampaign = forceCampaign;
    this.numberChallenges = 0;
    this.rewards = undefined;
    this.townGuardAMs = [];
    if ((gameManager.game.party.campaignMode || forceCampaign) && this.success) {
      if (this.scenario.rewards) {
        this.rewards = Object.assign(new ScenarioRewards(), this.scenario.rewards);
      }
      if (this.conclusion && this.conclusion.rewards) {
        if (!this.rewards) {
          this.rewards = Object.assign(new ScenarioRewards(), this.conclusion.rewards);
        } else {
          Object.assign(this.rewards, this.conclusion.rewards);
        }
      }

      // the scenario rewards can only be gained once in FH/GH2E
      if (!this.rewardsOnly && gameManager.fhRules(true) && this.rewards && gameManager.scenarioManager.isSuccess(this.scenario)) {
        this.rewards = undefined;
      }

      if (settingsManager.settings.scenarioRewards && this.rewards) {
        if (this.rewards.collectiveGold) {
          this.characters.forEach((_char, index) => {
            if (!this.collectiveGold[index]) this.collectiveGold[index] = 0;
          });
        }
        if (this.rewards.collectiveResources) {
          this.collectiveResources = this.collectiveResources || [];
          this.characters.forEach((_char, index) => {
            if (!this.collectiveResources[index]) this.collectiveResources[index] = {};
          });
        }
        if (this.rewards.items) {
          this.rewards.items.forEach((item, index) => {
            const itemData = gameManager.itemManager.getItem(
              item.split(':')[0]!.split('-')[0]!,
              item.split(':')[0]!.split('-').slice(1).join('-') || this.scenario.edition,
              true
            );
            if (itemData) {
              this.rewardItems[index] = itemData;
              this.rewardItemCount[index] = !item.includes(':') ? 1 : +item.split(':')[1]!;
              // add automatically on (potential) solo scenario
              const present = this.characters.filter((char) => !char.absent);
              if (present.length === 1) {
                const charIndex = this.characters.indexOf(present[0]!);
                this.items[charIndex] = this.items[charIndex] ?? [];
                if (!this.items[charIndex]!.includes(index)) {
                  this.items[charIndex]!.push(index);
                }
              }
            }
          });
        }
        if (this.rewards.chooseItem) {
          let index = 0;
          this.rewards.chooseItem.forEach((itemList) => {
            itemList.forEach((item) => {
              const itemData = gameManager.itemManager.getItem(
                item.split(':')[0]!.split('-')[0]!,
                item.split(':')[0]!.split('-').slice(1).join('-') || this.scenario.edition,
                true
              );
              if (itemData) {
                this.rewardItems[index] = itemData;
                this.rewardItemCount[index] = !item.includes(':') ? 1 : +item.split(':')[1]!;
                index++;
              }
            });
          });
        }
        if (this.rewards.chooseLocation && this.rewards.chooseLocation.length > 0 && !this.chooseLocation) {
          this.chooseLocation = this.rewards.chooseLocation[0];
        }
        if (!this.rewardsOnly && this.rewards.chooseUnlockCharacter && this.rewards.chooseUnlockCharacter.length > 0 && !this.chooseUnlockCharacter) {
          let index = 0;
          while (
            index < this.rewards.chooseUnlockCharacter.length &&
            gameManager.game.unlockedCharacters.includes(this.scenario.edition + ':' + this.rewards.chooseUnlockCharacter[index])
          ) {
            index++;
          }
          if (index < this.rewards.chooseUnlockCharacter.length) {
            this.chooseUnlockCharacter = this.rewards.chooseUnlockCharacter[index];
          }
        }
        if (this.rewards.calendarSectionManual) {
          this.rewards.calendarSectionManual.forEach((_section, index) => {
            if (!this.calendarSectionManual[index]) this.calendarSectionManual[index] = 0;
          });
        }
        if (settingsManager.settings.drawRandomItem && this.rewards.randomItemBlueprint && this.randomItemBlueprints.length < this.rewards.randomItemBlueprint) {
          const blueprints = gameManager.itemManager.drawRandomItemsBatch(this.scenario.edition, this.rewards.randomItemBlueprint - this.randomItemBlueprints.length, true);
          for (let i = this.randomItemBlueprints.length; i < this.rewards.randomItemBlueprint; i++) {
            const itemData = blueprints[i];
            this.randomItemBlueprints[i] = itemData ? +itemData.id : -1;
          }
        }
        if (settingsManager.settings.drawRandomItem && this.rewards.randomItemDesign && this.randomItemDesigns.length < this.rewards.randomItemDesign) {
          const designs = gameManager.itemManager.drawRandomItemsBatch(this.scenario.edition, this.rewards.randomItemDesign - this.randomItemDesigns.length, false);
          for (let i = this.randomItemDesigns.length; i < this.rewards.randomItemDesign; i++) {
            const itemData = designs[i];
            this.randomItemDesigns[i] = itemData ? +itemData.id : -1;
          }
        }
        if (settingsManager.settings.drawRandomItem && this.rewards.randomItem && !this.randomItem) {
          const from = +this.rewards.randomItem.split('-')[0]!;
          const to = +this.rewards.randomItem.split('-')[1]!;
          const itemEdition = this.rewards.randomItem.split('-').length > 2 ? this.rewards.randomItem.split('-')[2]! : this.scenario.edition;
          const itemData = gameManager.itemManager.drawRandomItem(itemEdition, false, from, to);
          if (itemData) {
            this.randomItem = itemData;
          }
        }
        if (settingsManager.settings.drawRandomItem && this.rewards.randomItems) {
          if (this.randomItems.length < this.characters.length && this.rewards.randomItems.split('-').length > 1) {
            const from = +this.rewards.randomItems.split('-')[0]!;
            const to = +this.rewards.randomItems.split('-')[1]!;
            const itemEdition = this.rewards.randomItems.split('-').length > 2 ? this.rewards.randomItems.split('-')[2]! : this.scenario.edition;
            const items = gameManager.itemManager.drawRandomItemsBatch(itemEdition, this.characters.length, false, from, to);
            for (let i = this.randomItems.length; i < this.characters.length; i++) {
              const character = this.characters[i]!;
              if (character.absent) {
                this.randomItems[i] = undefined;
              } else {
                let itemData = items.pop();
                if (character.progress.items.find((owned) => itemData && owned.name === itemData.id + '' && owned.edition === itemData.edition)) {
                  itemData = undefined;
                }
                this.randomItems[i] = itemData ? itemData : undefined;
              }
            }
          }
        }
        if (settingsManager.settings.drawRandomScenario && this.rewards.randomSideScenario && !this.randomSideScenario) {
          this.randomSideScenario = gameManager.scenarioManager.drawRandomScenario(this.scenario.edition);
        }
        if (this.rewards.townGuardAm) {
          this.townGuardAMs = this.rewards.townGuardAm.map((id) => additionalTownGuardAttackModifier.find((am) => am.id === id) as AttackModifier);
        }
        if (this.rewards.valueMapping) {
          Object.keys(this.rewards.valueMapping).forEach((key) => {
            if (this.rewards && this.rewards.valueMapping && this.rewards.valueMapping[key]) {
              const rule = this.rewards.valueMapping[key];
              const value = gameManager.scenarioRulesManager.presentEntitiesByFigureRule(rule, undefined).length;
              const rewardKey = rule.value as keyof ScenarioRewards;
              if (this.rewards && typeof this.rewards[rewardKey] === 'string') {
                (this.rewards[rewardKey] as string) = (this.rewards[rewardKey] as string).replaceAll(key, '' + value);
              }
            }
          });
        }
      }

      if (gameManager.challengesManager.enabled) {
        this.numberChallenges = gameManager.game.challengeDeck.keep.length;
      } else if (gameManager.fhRules()) {
        const townHall = gameManager.game.party.buildings.find(
          (buildingModel) => buildingModel.name === 'town-hall' && buildingModel.level && buildingModel.state !== 'wrecked'
        );
        if (townHall) {
          if (townHall.level === 1 || townHall.level === 2) {
            this.numberChallenges = 1;
          } else if (townHall.level === 3) {
            this.numberChallenges = 2;
          }
        }
      }
    }

    this.characters.forEach((character, index) => {
      const newXP =
        character.progress.experience +
        this.challenges * 2 +
        character.experience +
        (this.success && this.rewards && this.rewards.experience ? this.rewards.experience : 0) +
        (this.success && (!this.rewards || !this.rewards.ignoredBonus || !this.rewards.ignoredBonus.includes('experience'))
          ? gameManager.levelManager.experience()
          : 0);
      this.levelUp[index] = gameManager.characterManager.levelForXp(newXP) > gameManager.characterManager.levelForXp(character.progress.experience);
      const currentPerks = Math.floor(character.progress.battleGoals / 3);
      const newPerks = Math.floor((character.progress.battleGoals + (this.battleGoals[index] ?? 0)) / 3);
      this.perksUp[index] = newPerks > currentPerks;
    });
  }

  availableCollectiveGold(): number {
    return (
      (this.rewards && this.rewards.collectiveGold && this.collectiveGold.length > 0 && this.rewards.collectiveGold - this.collectiveGold.reduce((a, b) => a + b)) ||
      0
    );
  }

  availableCollectiveResource(type: LootType): number {
    const resource = (this.rewards && this.rewards.collectiveResources && this.rewards.collectiveResources.find((value) => value.type === type)) || {
      type: type,
      value: 0
    };
    const value = EntityValueFunction(resource.value);
    return (
      (value > 0 &&
        value -
          (this.collectiveResources && this.collectiveResources.length > 0
            ? this.collectiveResources.map((value) => value[type] || 0).reduce((a, b) => a + b)
            : 0)) ||
      0
    );
  }

  /** toggleBattleGoal: checkmarks earned for battle goals (value = box clicked, 1-based). */
  setBattleGoal(index: number, value: number, checked: boolean) {
    const character = this.characters[index];
    if (!character) {
      return;
    }
    let battleGoal;
    if (settingsManager.settings.battleGoals && character.battleGoal && character.battleGoals.length > 0) {
      battleGoal = gameManager.battleGoalManager.getBattleGoal(character.battleGoals[0]!);
    }
    const current = this.battleGoals[index] ?? 0;
    if (checked && current < value) {
      this.battleGoals[index] = value;
      if (battleGoal && battleGoal.checks > value) {
        this.battleGoals[index] = battleGoal.checks;
      }
    } else if (current >= value) {
      this.battleGoals[index] = value - 1;
      if (battleGoal && battleGoal.checks > value - 1) {
        this.battleGoals[index] = 0;
      }
    }
    this.updateFinish();
  }

  toggleTrial(index: number, checked: boolean) {
    this.trials[index] = checked;
    this.updateFinish();
  }

  setChallenges(value: number) {
    this.challenges = Math.max(0, Math.min(value, this.numberChallenges));
    this.updateFinish();
  }

  toggleItem(index: number, itemIndex: number) {
    this.items[index] = this.items[index] ?? [];
    const list = this.items[index]!;
    if (!list.includes(itemIndex)) {
      list.push(itemIndex);
    } else {
      list.splice(list.indexOf(itemIndex), 1);
    }
    this.updateFinish();
  }

  toggleRandomItem(index: number) {
    this.randomItemIndex = this.randomItemIndex === index ? -1 : index;
    this.updateFinish();
  }

  setCollectiveGold(index: number, value: number) {
    const old = this.collectiveGold[index] || 0;
    this.collectiveGold[index] = 0;
    const clamped = Math.max(0, Math.min(value, this.availableCollectiveGold()));
    this.collectiveGold[index] = old;
    this.collectiveGold[index] = clamped;
    this.updateFinish();
  }

  setCollectiveResource(index: number, type: LootType, value: number) {
    this.collectiveResources[index] = this.collectiveResources[index] || {};
    const old = this.collectiveResources[index]![type] || 0;
    this.collectiveResources[index]![type] = 0;
    const clamped = Math.max(0, Math.min(value, this.availableCollectiveResource(type)));
    this.collectiveResources[index]![type] = old;
    this.collectiveResources[index]![type] = clamped;
    this.updateFinish();
  }

  setCalendarSectionManual(index: number, value: number) {
    this.calendarSectionManual[index] = value;
    this.updateFinish();
  }

  selectLocation(location: string) {
    this.chooseLocation = location;
    this.updateFinish();
  }

  selectCharacter(character: string) {
    this.chooseUnlockCharacter = character;
    this.updateFinish();
  }

  /** GHS finish(): applies everything and ends the scenario. */
  finish(linkedIndex: string | undefined = undefined) {
    const linkedScenarioData = gameManager
      .scenarioData(this.scenario.edition)
      .find((scenarioData) => scenarioData.group === this.scenario.group && scenarioData.index === linkedIndex);

    if (settingsManager.settings.scenarioRewards && this.success && !gameManager.bbRules()) {
      this.characters.forEach((character, index) => {
        if (!character.absent) {
          if ((this.battleGoals[index] ?? 0) > 0) {
            character.progress.battleGoals += this.battleGoals[index]!;
            gameManager.personalQuestManager.trackPersonalQuestProgress(character, PersonalQuestAutotrackType.battleGoals, undefined, this.battleGoals[index]);
          }
          if (this.trials[index]) {
            character.progress.trial = undefined;
          }
          if (this.challenges) {
            for (let i = 0; i < this.challenges; i++) {
              character.progress.experience += 2;
            }
          }
          if (gameManager.trialsManager.favorsEnabled && gameManager.trialsManager.apply) {
            character.progress.gold += character.loot * gameManager.trialsManager.activeFavor('fh', 'wealth');
            if (this.battleGoals[index]) {
              character.progress.experience += 3 * gameManager.trialsManager.activeFavor('fh', 'knowledge');
            }
          }
        }

        if ((this.collectiveGold[index] ?? 0) > 0) {
          character.progress.gold += this.collectiveGold[index]!;
        }
        if (this.collectiveResources[index]) {
          Object.keys(this.collectiveResources[index]!).forEach((value) => {
            const lootType = value as LootType;
            character.progress.loot[lootType] = (character.progress.loot[lootType] || 0) + (this.collectiveResources[index]![lootType] || 0);
          });
        }

        this.rewardItems.forEach((_item, itemIndex) => {
          if (this.items.every((items) => !items || !items.includes(itemIndex))) {
            this.items[index] = this.items[index] || [];
            this.items[index]!.push(itemIndex);
          }
        });

        if (this.items[index] && this.items[index]!.length > 0) {
          this.items[index]!.forEach((itemIndex) => {
            const item = this.rewardItems[itemIndex];
            if (item) {
              if (settingsManager.settings.characterItems) {
                gameManager.itemManager.addItem(item, character);
              }
              gameManager.itemManager.addItemCount(item);
            }
          });
        }
      });

      if (this.rewards && this.rewards.collectiveResources) {
        this.rewards.collectiveResources.forEach((value) => {
          const available = this.availableCollectiveResource(value.type);
          if (available) {
            gameManager.game.party.loot[value.type] = (gameManager.game.party.loot[value.type] || 0) + available;
          }
        });
      }
      if (this.chooseLocation) {
        gameManager.game.party.manualScenarios.push(new GameScenarioModel(this.chooseLocation, this.scenario.edition, this.scenario.group));
      }
      if (
        settingsManager.settings.automaticUnlocking &&
        this.chooseUnlockCharacter &&
        !gameManager.game.unlockedCharacters.includes(this.scenario.edition + ':' + this.chooseUnlockCharacter)
      ) {
        gameManager.game.unlockedCharacters.push(this.scenario.edition + ':' + this.chooseUnlockCharacter);
      }
      if (this.challenges) {
        for (let i = 0; i < this.challenges; i++) {
          gameManager.game.party.townGuardPerks += 1;
        }
      }
      if ((this.gainRewards || this.forceCampaign) && this.randomItemBlueprints.length > 0) {
        this.randomItemBlueprints.forEach((itemId) => {
          if (itemId === -1) {
            if (gameManager.fhRules()) gameManager.game.party.inspiration += 1;
          } else {
            gameManager.game.party.unlockedItems.push(new CountIdentifier(itemId, this.scenario.edition));
          }
        });
      }
      if ((this.gainRewards || this.forceCampaign) && this.randomItemDesigns.length > 0) {
        this.randomItemDesigns.forEach((itemId) => {
          if (itemId === -1) {
            if (gameManager.fhRules()) gameManager.game.party.inspiration += 1;
          } else {
            gameManager.game.party.unlockedItems.push(new CountIdentifier(itemId, this.scenario.edition));
          }
        });
      }
      if ((this.gainRewards || this.forceCampaign) && this.randomSideScenario) {
        gameManager.game.party.manualScenarios.push(new GameScenarioModel(this.randomSideScenario.index, this.randomSideScenario.edition));
      }
      if ((this.gainRewards || this.forceCampaign) && this.rewards && this.rewards.calendarSectionManual) {
        this.rewards.calendarSectionManual.forEach((sectionManual, index) => {
          if ((this.calendarSectionManual[index] ?? -1) >= 0) {
            const week = gameManager.game.party.weeks + this.calendarSectionManual[index]!;
            gameManager.game.party.weekSections[week] = [...(gameManager.game.party.weekSections[week] || []), sectionManual.section];
          }
        });
      }
      if (gameManager.challengesManager.enabled && this.challenges) {
        gameManager.game.challengeDeck.finished += this.challenges;
      }
      gameManager.trialsManager.applyTrialCards();
    }

    if (this.conclusionOnly) {
      gameManager.scenarioManager.finishScenario(
        this.scenario,
        true,
        this.conclusion,
        false,
        false,
        settingsManager.settings.scenarioRewards && (this.characterProgress || this.forceCampaign),
        this.gainRewards || this.forceCampaign,
        true
      );
    } else {
      gameManager.scenarioManager.finishScenario(
        gameManager.game.scenario,
        this.success,
        this.conclusion,
        false,
        linkedScenarioData !== undefined,
        settingsManager.settings.scenarioRewards && !gameManager.bbRules() && (this.characterProgress || this.forceCampaign),
        this.gainRewards || this.forceCampaign
      );
    }

    if (this.overlayCustomText && this.conclusion && this.rewards && this.rewards.overlayCustomText) {
      const conclusionModel = gameManager.game.party.conclusions.find(
        (m) => m.index === this.conclusion!.index && m.edition === this.conclusion!.edition && m.group === this.conclusion!.group
      );
      if (conclusionModel) {
        conclusionModel.custom = this.overlayCustomText;
      }
    }

    if (linkedScenarioData) {
      gameManager.scenarioManager.setScenario(new Scenario(linkedScenarioData), true);
    } else {
      gameManager.game.figures.forEach((figure) => {
        if (figure instanceof Character) {
          figure.absent = false;
        }
      });
    }
  }

  /** GHS restart(): end without rewards and set the scenario up again. */
  restart() {
    gameManager.scenarioManager.finishScenario(
      gameManager.game.scenario,
      this.success,
      this.conclusion,
      true,
      false,
      settingsManager.settings.scenarioRewards && (this.characterProgress || this.forceCampaign),
      this.gainRewards || this.forceCampaign,
      false
    );
  }
}
