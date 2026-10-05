// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
import { LootType } from './data/Loot';

export class BuildingModel {
  name: string;
  level: number;
  state: 'normal' | 'damaged' | 'wrecked';
  attacked: true | undefined;

  constructor(name: string = '', level: number = 1, state: 'normal' | 'damaged' | 'wrecked' = 'normal') {
    this.name = name;
    this.level = level;
    this.state = state;
  }
}

export class GardenModel {
  flipped: boolean = false;
  automated: boolean = true;
  plots: LootType[] = [];
}
