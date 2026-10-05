import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapGhsNode, gameManager, GameState } from '../src/node';
import { Character } from '../src/vendor/game/model/Character';
import { Monster } from '../src/vendor/game/model/Monster';
import { Scenario } from '../src/vendor/game/model/Scenario';

const monsters = () => gameManager.game.figures.filter((f): f is Monster => f instanceof Monster);
const characters = () => gameManager.game.figures.filter((f): f is Character => f instanceof Character);

describe('GHS runtime in Node', () => {
  beforeAll(async () => {
    await bootstrapGhsNode();
  });

  it('loads Frosthaven and crossover edition data', () => {
    const editions = gameManager.editionData.map((e) => e.edition);
    expect(editions).toEqual(expect.arrayContaining(['fh', 'fh-crossover', 'gh', 'fc', 'jotl']));
    const fhCharacters = gameManager.charactersData('fh').map((c) => c.name);
    expect(fhCharacters).toContain('drifter');
    expect(gameManager.getCharacterData('brute', 'fh-crossover').perks.length).toBeGreaterThan(0);
  });

  it('plays the first round of scenario 1', () => {
    gameManager.game.edition = 'fh';
    gameManager.characterManager.addCharacter(gameManager.getCharacterData('drifter', 'fh'), 1);
    gameManager.characterManager.addCharacter(gameManager.getCharacterData('banner-spear', 'fh'), 1);
    const scenarioData = gameManager.scenarioManager.scenarioData('fh').find((s) => s.index === '1')!;
    expect(scenarioData).toBeDefined();
    gameManager.scenarioManager.setScenario(new Scenario(scenarioData));

    expect(monsters().length).toBeGreaterThan(0);

    for (const character of characters()) {
      character.initiative = 30;
    }
    gameManager.roundManager.nextGameState();
    expect(gameManager.game.state).toBe(GameState.next);
    expect(gameManager.game.round).toBe(1);
    const drawn = monsters().filter((m) => m.ability >= 0);
    expect(drawn.length).toBeGreaterThan(0);

    const model = gameManager.game.toModel();
    expect(model.scenario?.index).toBe('1');
    expect(JSON.parse(JSON.stringify(model)).characters.length).toBe(2);
  });
});
