// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { gameManager } from '../../businesslogic/GameManager';
import { BASE_TYPE, CommandImpl } from '../Command';
import { GameState } from '../../model/Game';

export class RoundStateCommand extends CommandImpl {
  id: string = 'round.state';
  requiredParameters: number = 0;

  validParameters(): boolean {
    return true;
  }

  executeWithParameters() {
    gameManager.roundManager.nextGameState();
  }

  override before(): BASE_TYPE[] {
    return ['command.' + this.id + (gameManager.game.state === GameState.next ? '.next' : '.draw')];
  }
}
