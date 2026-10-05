// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { Editional } from './Editional';
import { Identifier } from './Identifier';

export class BattleGoal implements Editional {
  cardId: string = '';
  name: string = '';
  checks: number = 1;
  alias: Identifier | undefined;

  // from Editional
  edition: string = '';
}
