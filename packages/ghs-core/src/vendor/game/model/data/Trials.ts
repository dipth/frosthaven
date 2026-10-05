// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { Editional } from './Editional';

export class TrialCard implements Editional {
  cardId: number = 0;
  automation: 'fully' | 'manual' | undefined;

  // from Editional
  edition: string = '';
}

export class Favor implements Editional {
  name: string = '';
  points: number = 1;
  automation: 'fully' | 'manual' | undefined;

  // from Editional
  edition: string = '';
}
