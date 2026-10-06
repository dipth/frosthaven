/**
 * Builds the online-mode board data from fhtts processedScenarios (CC BY-NC-SA,
 * gudyfr/fhtts) and the committed tile calibration (scripts/calibration):
 *
 *   generated/boards/<scenario>.json  tiles, and per scenario/section map the
 *                                     monsters, tokens and overlays in global
 *                                     axial hex coordinates
 *   generated/images.json             Worldhaven image paths for standees,
 *                                     terrain, ability cards and map tiles
 *
 * Hex coordinates: axial (x, y), pointy-top hexes; on screen
 * px = size * (x + y/2), py = -size * sqrt(3)/2 * y (as in the scenario book).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Hex = { x: number; y: number };
interface Trigger {
  type?: string;
  action?: string;
  what?: { type?: string; name?: string };
  id?: string;
}
interface Position extends Hex {
  levels?: string;
  standeeNr?: number;
  trigger?: Trigger;
  type?: string;
}
interface Entry {
  reference: { tile: string; tileOrientation?: string };
  tokens?: { name: string; orientation: number; positions: Position[] }[];
  monsters?: { name: string; orientation: number; positions: Position[] }[];
  overlays?: { name: string; orientation: number; positions: Position[] }[];
}
interface FhttsScenario {
  id: string;
  layout?: { name: string; orientation: string; center: Hex; origin: Hex }[];
  maps: { type: string; name: string | number; entries?: Entry[] }[];
}
interface Calibration {
  image: string;
  size: [number, number];
  spacing: number;
  origin: { x: number; y: number };
  rotation: number;
}

import type { BoardFile, BoardItem, BoardMap, BoardTile } from '@fh/engine';

const DOUBLE = new Set([
  'Barricade',
  'Large Snow Corridor',
  'Log',
  'Large Water',
  'Bookshelf',
  'Control Console',
  'Large Debris',
  'Large Cave Rock',
  'Large Dungeon Corridor',
  'Large Ice Corridor',
  'Large Cave Corridor',
  'Large Metal Corridor',
  'Large Snow Rock',
  'Power Conduit',
  'Supply Shelf',
  'Sarcophagus'
]);
const TRIPLE = new Set(['Tree', 'Huge Water', 'Large Ice Crystal']);
const MONSTER_RENAMES: Record<string, string> = { 'The Orphan': 'orphan' };

export function rotateHex(x: number, y: number, orientation: number): Hex {
  switch (((orientation % 360) + 360) % 360) {
    case 60:
      return { x: -y, y: x + y };
    case 120:
      return { x: -x - y, y: x };
    case 180:
      return { x: -x, y: -y };
    case 240:
      return { x: y, y: -x - y };
    case 300:
      return { x: x + y, y: -x };
    default:
      return { x, y };
  }
}

function overlayHexes(name: string, orientation: number, at: Hex, origin: Hex): Hex[] {
  const shape: Hex[] = TRIPLE.has(name)
    ? [{ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -1, y: 1 }]
    : DOUBLE.has(name)
      ? [{ x: 0, y: 0 }, { x: -1, y: 0 }]
      : [{ x: 0, y: 0 }];
  return shape.map((h) => {
    const r = rotateHex(h.x, h.y, orientation);
    return { x: r.x + at.x + origin.x, y: r.y + at.y + origin.y };
  });
}

type Worldhaven = { name: string; image: string; expansion: string; [key: string]: unknown }[];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function buildBoards(outDir: string, calibrationFile: string) {
  const scenarios = JSON.parse(readFileSync(join(outDir, 'fhtts/processedScenarios.human.json'), 'utf8')) as Record<string, FhttsScenario>;
  const calibration = JSON.parse(readFileSync(calibrationFile, 'utf8')) as Record<string, Calibration>;
  const fh = JSON.parse(readFileSync(join(outDir, 'ghs/fh.json'), 'utf8')) as { monsters: { name: string }[] };
  const ghsMonsters = new Set(fh.monsters.map((m) => m.name));
  const tileInfos = JSON.parse(readFileSync(join(outDir, 'fhtts/tileInfos.json'), 'utf8')) as Record<string, { angle?: number }>;
  const wh = (file: string) => JSON.parse(readFileSync(join(outDir, 'worldhaven', file), 'utf8')) as Worldhaven;
  const tokens = wh('tokens.json').filter((t) => t.expansion === 'frosthaven' && t.image.includes('/terrain/'));

  const terrainImage = (name: string): string | undefined => {
    const size = /^Huge /.test(name) ? 'huge' : /^Large /.test(name) ? 'large' : 'small';
    const base = slug(name.replace(/^(Large|Huge) /, ''));
    let matches = tokens.filter((t) => slug(t.name) === base);
    // e.g. 'Spike Pit' is the 'spike pit trap' token.
    if (!matches.length) matches = tokens.filter((t) => slug(t.name).startsWith(base));
    if (!matches.length) return undefined;
    const pick =
      matches.find((t) => t.image.includes(`-${size}`)) ??
      (size === 'huge' ? matches.find((t) => t.image.includes('-large')) : undefined) ??
      matches.find((t) => /-closed/.test(t.image)) ??
      matches[0]!;
    return pick.image;
  };
  const monsterName = (name: string) => {
    const s = MONSTER_RENAMES[name] ?? name.toLowerCase().replace(/'/g, '').replace(/ /g, '-');
    return ghsMonsters.has(s) ? s : s;
  };

  const boardsDir = join(outDir, 'boards');
  mkdirSync(boardsDir, { recursive: true });
  let count = 0;
  for (const [id, scenario] of Object.entries(scenarios)) {
    if (!scenario.layout?.length) continue;
    const layout = new Map(scenario.layout.map((t) => [t.name, t]));
    const tiles: BoardTile[] = scenario.layout.map((t) => {
      const cal = calibration[t.name];
      return {
        name: t.name,
        // Effective orientation (fhtts subtracts the tile's own angle, e.g. 30 degrees for tile 14).
        orientation: (((Number(t.orientation) - (tileInfos[t.name.slice(0, 2)]?.angle ?? 0)) % 360) + 360) % 360,
        origin: t.origin,
        ...(cal
          ? {
              image: {
                path: cal.image,
                width: cal.size[0],
                height: cal.size[1],
                spacing: cal.spacing,
                origin: cal.origin,
                rotation: cal.rotation
              }
            }
          : {})
      };
    });
    const maps: BoardMap[] = scenario.maps.map((m) => {
      const items: BoardItem[] = [];
      const mapTiles = new Set<string>();
      for (const e of m.entries ?? []) {
        const tile = layout.get(e.reference.tile);
        if (!tile) continue;
        mapTiles.add(tile.name);
        const o = tile.origin;
        for (const t of e.tokens ?? []) {
          for (const p of t.positions) {
            items.push({ kind: 'token', name: t.name, hex: { x: p.x + o.x, y: p.y + o.y }, ...(p.trigger ? { trigger: p.trigger } : {}) });
          }
        }
        for (const mo of e.monsters ?? []) {
          for (const p of mo.positions) {
            items.push({
              kind: 'monster',
              name: monsterName(mo.name),
              label: mo.name,
              hex: { x: p.x + o.x, y: p.y + o.y },
              levels: p.levels || 'nnn',
              ...(p.standeeNr ? { standee: p.standeeNr } : {})
            });
          }
        }
        for (const ov of e.overlays ?? []) {
          const image = terrainImage(ov.name);
          for (const p of ov.positions) {
            items.push({
              kind: 'overlay',
              name: ov.name,
              type: p.type ?? '',
              hexes: overlayHexes(ov.name, ov.orientation, p, o),
              orientation: ov.orientation,
              ...(p.trigger ? { trigger: p.trigger } : {}),
              ...(image ? { image } : {})
            });
          }
        }
      }
      return { type: m.type, name: String(m.name), tiles: [...mapTiles], items };
    });
    const board: BoardFile = { scenario: id, tiles, maps };
    writeFileSync(join(boardsDir, `${id}.json`), JSON.stringify(board));
    count++;
  }
  console.log(`  boards: ${count}`);

  // Image index for the web client.
  const art = wh('art.json').filter((a) => a.expansion === 'frosthaven');
  const monsters: Record<string, string> = {};
  for (const a of art.filter((a) => a.image.includes('/monsters/'))) {
    monsters[slug(String(a.name).replace(/ art$/, ''))] = a.image;
  }
  const icons: Record<string, string> = {};
  for (const a of art.filter((a) => a.image.includes('/icons/'))) {
    icons[slug(String(a.name).replace(/ icon$/, ''))] = a.image;
  }
  const abilityCards: Record<string, Record<string, string>> = {};
  for (const c of wh('character-ability-cards.json')) {
    const character = slug(String(c['character-xws'] ?? ''));
    if (!character || /^\d+$/.test(c.name) || /back$/.test(c.name)) continue;
    const prefix = c.expansion === 'frosthaven' ? 'fh' : c.expansion === 'gloomhaven' ? 'gh' : c.expansion === 'jaws of the lion' ? 'jotl' : 'fc';
    (abilityCards[`${prefix}:${character}`] ??= {})[slug(c.name)] = c.image;
  }
  const conditions: Record<string, string> = {};
  for (const t of wh('tokens.json').filter((t) => t.expansion === 'frosthaven' && t.image.includes('/conditions/'))) {
    conditions[slug(t.name)] = t.image;
  }
  const pets: Record<string, string> = {};
  for (const p of wh('pet-cards.json').filter((p) => p.expansion === 'frosthaven' && !/-back\./.test(p.image))) {
    const id = /^(\d+)\s/.exec(String(p.name))?.[1];
    if (id) pets[id] = p.image;
  }
  writeFileSync(join(outDir, 'images.json'), JSON.stringify({ monsters, icons, abilityCards, conditions, pets }));
  console.log(`  images: ${Object.keys(monsters).length} monsters, ${Object.keys(abilityCards).length} card sets`);
}
