// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
export enum FigureErrorType {
  deck = 'deck',
  monsterEdition = 'monsterEdition',
  monsterType = 'monsterType',
  stat = 'stat',
  unknown = 'unknown'
}

export class FigureError {
  type: FigureErrorType;
  args: string[];

  constructor(type: FigureErrorType, ...args: string[]) {
    this.type = type;
    this.args = args;
  }
}
