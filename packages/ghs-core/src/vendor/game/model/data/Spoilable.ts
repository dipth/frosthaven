// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
export interface Spoilable {
  name: string;
  spoiler: boolean;
}

export class SpoilableMock implements Spoilable {
  name: string;
  spoiler: boolean = true;

  constructor(name: string) {
    this.name = name;
  }
}
