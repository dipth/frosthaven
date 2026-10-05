// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { gameManager } from '../../businesslogic/GameManager';
import { BASE_TYPE, CommandImpl } from '../Command';
import { Character } from '../../model/Character';

export class CharacterInitiativeCommand extends CommandImpl {
  id: string = 'character.initiative';
  requiredParameters: number = 2;

  validParameters(number: number, initiative: number, longRest: boolean): boolean {
    return (
      (initiative >= 0 &&
        initiative <= 99 &&
        (!longRest || initiative === 99) &&
        gameManager.game.figures.find((figure) => figure instanceof Character && figure.number === number) !== undefined) ||
      false
    );
  }

  executeWithParameters(number: number, initiative: number, longRest: boolean) {
    if (longRest && initiative !== 99) {
      this.executionError('invalid long rest');
    }

    const character = gameManager.game.figures.find((figure) => figure instanceof Character && figure.number === number) as Character;
    if (character) {
      character.initiative = initiative;
      character.longRest = longRest;
      if (this.server) {
        character.initiativeVisible = false;
      }
    } else {
      this.executionError('character not found');
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
