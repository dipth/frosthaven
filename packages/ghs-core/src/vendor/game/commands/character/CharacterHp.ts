// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { gameManager } from '../../businesslogic/GameManager';
import { BASE_TYPE, CommandImpl } from '../Command';
import { Character } from '../../model/Character';

export class CharacterHpCommand extends CommandImpl {
  id: string = 'character.hp';
  requiredParameters: number = 2;

  constructor(...parameters: BASE_TYPE[]) {
    super(...parameters);
  }

  validParameters(number: number, hp: number): boolean {
    return (
      (gameManager.game.figures.find((figure) => figure instanceof Character && figure.number === number) !== undefined && hp !== 0) ||
      false
    );
  }

  executeWithParameters(number: number, hp: number) {
    const character = gameManager.game.figures.find((figure) => figure instanceof Character && figure.number === number) as Character;
    if (character) {
      gameManager.entityManager.changeHealth(character, character, hp);
    } else {
      this.executionError('character not found or invalid');
    }
  }

  override before(): BASE_TYPE[] {
    const character = gameManager.game.figures.find(
      (figure) => figure instanceof Character && figure.number === this.parameters[0]
    ) as Character;
    if (character) {
      return ['command.' + this.id, gameManager.characterManager.characterName(character, true, true), this.parameters[1]];
    }

    return ['command.invalid.' + this.id, ...this.parameters];
  }
}
