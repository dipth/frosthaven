// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
export enum Element {
  fire = 'fire',
  ice = 'ice',
  air = 'air',
  earth = 'earth',
  light = 'light',
  dark = 'dark',
  wild = 'wild'
}

export enum ElementState {
  strong = 'strong',
  waning = 'waning',
  inert = 'inert',
  new = 'new',
  consumed = 'consumed',
  partlyConsumed = 'partlyConsumed',
  always = 'always'
}

export class ElementModel {
  type: Element;
  state: ElementState = ElementState.inert;

  constructor(type: Element) {
    this.type = type;
  }
}

export const defaultElementBoard: ElementModel[] = [
  new ElementModel(Element.fire),
  new ElementModel(Element.ice),
  new ElementModel(Element.air),
  new ElementModel(Element.earth),
  new ElementModel(Element.light),
  new ElementModel(Element.dark)
];
