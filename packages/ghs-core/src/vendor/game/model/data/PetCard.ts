// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { Action } from './Action';
import { Editional } from './Editional';
import { Identifier } from './Identifier';

export class PetCard implements Editional {
  id: string = '';
  cardId: number = 0;
  edition: string = '';
  lost: boolean = false;
  round: boolean = false;
  action: Action | undefined;
}

export class PetIdentifier extends Identifier {
  petname: string;
  active: boolean;
  lost: boolean;

  constructor(name: string, edition: string, petname: string = '', active: boolean = false, lost: boolean = false) {
    super(name, edition);
    this.petname = petname;
    this.active = active;
    this.lost = lost;
  }
}
