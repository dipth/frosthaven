// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { gameManager } from '../../businesslogic/GameManager';
import { settingsManager } from '../../businesslogic/SettingsManager';
import { BASE_TYPE, CommandImpl } from '../Command';
import { Character } from '../../model/Character';

export class CharacterLootDrawCommand extends CommandImpl {
  id: string = 'character.loot.draw';
  requiredParameters: number = 1;

  constructor(...parameters: BASE_TYPE[]) {
    super(...parameters);
  }

  validParameters(number: number): boolean {
    return (
      (settingsManager.settings.lootDeck &&
        Object.keys(gameManager.game.lootDeck.cards).length > 0 &&
        gameManager.game.figures.find((figure) => figure instanceof Character && figure.number === number && figure.active) !==
          undefined) ||
      false
    );
  }

  executeWithParameters(number: number) {
    const character = gameManager.game.figures.find((figure) => figure instanceof Character && figure.number === number) as Character;
    if (character && character.active) {
      gameManager.lootManager.drawCard(gameManager.game.lootDeck, character);
    } else {
      this.executionError('character not found or invalid');
    }
  }

  override before(): BASE_TYPE[] {
    const character = gameManager.game.figures.find(
      (figure) => figure instanceof Character && figure.number === this.parameters[0]
    ) as Character;
    if (character) {
      return ['command.' + this.id, gameManager.characterManager.characterName(character, true, true)];
    }

    return ['command.invalid.' + this.id, ...this.parameters];
  }
}
