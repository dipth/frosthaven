// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { Editional } from './data/Editional';

export interface Figure extends Editional {
  name: string;
  level: number;
  off: boolean;
  active: boolean;
  getInitiative(): number;
  type: string;
}
