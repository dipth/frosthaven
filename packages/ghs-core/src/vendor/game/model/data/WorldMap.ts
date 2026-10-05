// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
export class WorldMapCoordinates {
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;
  gridLocation: string | undefined;
  image: string | undefined;
}

export class WorldMapOverlay {
  name: string = '';
  location: string = '';
  coordinates: WorldMapCoordinates = new WorldMapCoordinates();
}
