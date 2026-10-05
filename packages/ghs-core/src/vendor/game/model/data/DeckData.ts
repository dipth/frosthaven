// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { AbilityCard } from './AbilityCard';
import { Editional } from './Editional';

export class DeckData implements Editional {
  name: string;
  character: boolean;
  abilities: AbilityCard[];

  // from Editional
  edition: string;

  constructor(edition: string = '', name: string = '', character = false, abilityCards: AbilityCard[] = []) {
    this.name = name;
    this.abilities = abilityCards;
    this.edition = edition;
    this.character = character;
  }
}
