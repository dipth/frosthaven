/**
 * Headless port of GHS src/app/ui/footer/scenario-rules/scenario-rules.ts and
 * scenario-rule.ts/.html (AGPL-3.0): which scenario rules are shown, what they
 * open/add, and their text. Used by the server (apply) and the client (show).
 */
import { gameManager, labelText, plainText } from '@fh/ghs-core';
import { Condition } from '@fh/ghs-core/vendor/game/model/data/Condition';
import type { RoomData } from '@fh/ghs-core/vendor/game/model/data/RoomData';
import type { ScenarioData } from '@fh/ghs-core/vendor/game/model/data/ScenarioData';
import { HiddenScenarioFigureRuleTypes, type ScenarioFigureRule, type ScenarioRule } from '@fh/ghs-core/vendor/game/model/data/ScenarioRule';
import { EntityValueFunction, type Entity } from '@fh/ghs-core/vendor/game/model/Entity';
import { actionLines } from './actions';

export function ruleSections(index: number): ScenarioData[] {
  const ruleModel = gameManager.game.scenarioRules[index];
  if (!ruleModel) return [];
  const scenario = gameManager.scenarioRulesManager.getScenarioForRule(ruleModel.identifier).scenario;
  const rule = ruleModel.rule;
  if (!scenario || !rule?.sections) return [];
  return gameManager
    .sectionData(scenario.edition)
    .filter(
      (sectionData) =>
        !gameManager.game.sections.find((active) => active.edition === sectionData.edition && active.group === scenario.group && active.index === sectionData.index) &&
        sectionData.group === scenario.group &&
        rule.sections.includes(sectionData.index)
    );
}

export function ruleRooms(index: number): RoomData[] {
  const rooms: RoomData[] = [];
  const ruleModel = gameManager.game.scenarioRules[index];
  if (!ruleModel) return rooms;
  const scenario = gameManager.scenarioRulesManager.getScenarioForRule(ruleModel.identifier).scenario;
  const rule = ruleModel.rule;
  if (scenario && rule?.rooms) {
    rule.rooms.forEach((roomNumber) => {
      const roomData = scenario.rooms.find((r) => r.roomNumber === roomNumber);
      if (roomData && gameManager.game.scenario && !gameManager.game.scenario.revealedRooms.includes(roomNumber)) {
        rooms.push(roomData);
      }
    });
  }
  return rooms;
}

export function ruleFigureRules(rule: ScenarioRule): ScenarioFigureRule[] {
  return (
    rule.figures?.filter((figureRule) => {
      if (HiddenScenarioFigureRuleTypes.includes(figureRule.type)) return false;
      const figures = gameManager.scenarioRulesManager.figuresByFigureRule(figureRule, rule);
      if (figures.length === 0) return false;
      const all = (fn: (entity: Entity) => boolean) => figures.some((figure) => !gameManager.entityManager.entities(figure).every(fn));
      switch (figureRule.type) {
        case 'gainCondition':
          return all((entity) => gameManager.entityManager.hasCondition(entity, new Condition(figureRule.value)));
        case 'permanentCondition':
          return all((entity) => gameManager.entityManager.hasCondition(entity, new Condition(figureRule.value), true));
        case 'loseCondition':
          return all((entity) => !gameManager.entityManager.hasCondition(entity, new Condition(figureRule.value)));
        case 'losePermanentCondition':
          return all((entity) => !gameManager.entityManager.hasCondition(entity, new Condition(figureRule.value), true));
        case 'toggleOn':
        case 'toggleOff':
          return figures.some((figure) => figure.off === (figureRule.type === 'toggleOn'));
        default:
          return true;
      }
    }) ?? []
  );
}

export function ruleVisible(index: number): boolean {
  const ruleModel = gameManager.game.scenarioRules[index];
  if (!ruleModel) return false;
  const rule = ruleModel.rule;
  if (
    rule.disablingRules?.length &&
    rule.disablingRules.some((value) =>
      gameManager.game.scenarioRules.find(
        (other, otherIndex) =>
          index !== otherIndex &&
          value.edition === other.identifier.edition &&
          value.group === other.identifier.group &&
          (value.index === other.identifier.index || value.index === -1) &&
          value.scenario === other.identifier.scenario &&
          value.section === other.identifier.section &&
          ruleVisible(otherIndex)
      )
    )
  ) {
    return false;
  }
  return (
    gameManager.scenarioRulesManager.spawns(rule).length > 0 ||
    (rule.objectiveSpawns?.length ?? 0) > 0 ||
    (rule.elements?.length ?? 0) > 0 && rule.elements.some((e) => gameManager.game.elementBoard.find((element) => element.type === e.type)?.state !== e.state) ||
    ruleSections(index).length > 0 ||
    ruleRooms(index).length > 0 ||
    ruleFigureRules(rule).length > 0 ||
    !!rule.note ||
    !!rule.finish ||
    !!rule.reverseInitiative ||
    !!rule.randomDungeon ||
    (rule.statEffects?.length ?? 0) > 0
  );
}

/** Whether the rule has something to apply (otherwise it's informational). */
export function ruleApplicable(rule: ScenarioRule): boolean {
  return (
    gameManager.scenarioRulesManager.spawns(rule).length > 0 ||
    (rule.objectiveSpawns?.length ?? 0) > 0 ||
    (rule.elements?.length ?? 0) > 0 ||
    !!rule.finish ||
    (rule.rooms?.length ?? 0) > 0 ||
    (rule.sections?.length ?? 0) > 0 ||
    !!rule.randomDungeon ||
    !!rule.reverseInitiative ||
    (rule.figures?.some((f) => !HiddenScenarioFigureRuleTypes.includes(f.type)) ?? false) ||
    (rule.statEffects?.length ?? 0) > 0
  );
}

const text = (key: string, args: (string | number)[] = []) => plainText(labelText(key, args.map(String)));
const ghsString = (value: string) => (value.includes('%') ? plainText(value) : text(value));

/** Plain-text lines describing a pending rule, like GHS' scenario-rule template. */
export function describeRule(index: number): string[] {
  const ruleModel = gameManager.game.scenarioRules[index];
  if (!ruleModel) return [];
  const rule = ruleModel.rule;
  const lines: string[] = [];
  if (rule.noteTop) lines.push(ghsString(rule.noteTop));
  const spawns = gameManager.scenarioRulesManager.spawns(rule);
  if (spawns.length) {
    lines.push(
      spawns
        .map((spawn) =>
          text('scenario.rules.spawn' + (spawn.marker ? 'Marker' : ''), [
            'data.monster.' + spawn.monster.name,
            gameManager.scenarioRulesManager.spawnType(spawn.monster) || '',
            spawn.count ? gameManager.scenarioRulesManager.spawnCount(rule, spawn) + ' ' : '',
            spawn.marker || ''
          ])
        )
        .join(' and ')
    );
  }
  rule.objectiveSpawns?.forEach((spawn) => {
    const count = EntityValueFunction(spawn.count || 1);
    lines.push(`Add ${count} ${spawn.objective.escort ? 'escort' : 'objective'}${count > 1 ? 's' : ''}${spawn.marker ? ` (${spawn.marker})` : ''}`);
  });
  rule.elements?.forEach((element) => lines.push(`${text('game.element.' + element.type)}: ${text('game.element.state.' + element.state)}`));
  ruleRooms(index).forEach((room) => lines.push(text(room.marker ? 'scenario.rules.openRoomMarker' : 'scenario.rules.openRoom', [room.marker || ''])));
  ruleSections(index).forEach((section) =>
    lines.push(
      text(section.conclusion ? 'scenario.rules.finishWithConclusion' : 'scenario.rules.addSection', [
        section.index,
        gameManager.scenarioManager.scenarioTitle(section, true),
        section.marker || ''
      ])
    )
  );
  ruleFigureRules(rule).forEach((figureRule) => {
    const names = gameManager.scenarioRulesManager
      .figuresByFigureRule(figureRule, rule)
      .map((figure) => text(gameManager.isCharacter(figure) ? `data.character.${figure.edition}.${figure.name}` : `data.monster.${figure.name}`))
      .join(', ');
    lines.push(text('scenario.rules.figures.' + figureRule.type, [names, figureRule.value || '', figureRule.value || '']));
  });
  rule.statEffects?.forEach((effect) => {
    const name = text('data.monster.' + effect.identifier.name);
    const actions = effect.statEffect?.actions?.length ? actionLines(effect.statEffect.actions as never).map((l) => l.text).join(', ') : '';
    lines.push(effect.note ? ghsString(effect.note) : `${name}: ${actions}`);
  });
  if (rule.note) lines.push(ghsString(rule.note));
  if (rule.finish === 'won') lines.push('The scenario is won.');
  if (rule.finish === 'lost') lines.push('The scenario is lost.');
  if (rule.finish === 'round') lines.push('The round ends.');
  return lines.filter(Boolean);
}
