/**
 * Downloads the Worldhaven images we use into ASSETS_DIR/worldhaven/<path>,
 * driven by the Worldhaven data indexes written by `pnpm data:sync`.
 *
 * Worldhaven's assets are licensed to its maintainer only. They are fetched
 * into private storage for this private group, never committed to git, never
 * baked into images, and only served behind authentication.
 *
 *   ASSETS_DIR=/data/assets tsx scripts/sync-assets.ts [--dry-run]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const repoRoot = resolve(pkgRoot, '../..');
const generated = join(pkgRoot, 'generated/worldhaven');
const assetsDir = resolve(repoRoot, process.env['ASSETS_DIR'] ?? '.assets');
const target = join(assetsDir, 'worldhaven');
const dryRun = process.argv.includes('--dry-run');

const sources = JSON.parse(readFileSync(join(pkgRoot, 'sources.json'), 'utf8'));
const { commit } = sources.worldhaven as { commit: string };

type Entry = { image: string; expansion: string };

/** Which index files to fetch, and for which expansions. */
const wanted: Record<string, string[]> = {
  'character-ability-cards': ['frosthaven', 'gloomhaven', 'forgotten circles', 'jaws of the lion'],
  'character-mats': ['frosthaven', 'gloomhaven', 'forgotten circles', 'jaws of the lion'],
  'character-perks': ['frosthaven'],
  'attack-modifiers': ['frosthaven', 'gloomhaven', 'forgotten circles', 'jaws of the lion'],
  'monster-ability-cards': ['frosthaven'],
  'monster-stat-cards': ['frosthaven'],
  'map-tiles': ['frosthaven'],
  tokens: ['frosthaven'],
  events: ['frosthaven'],
  items: ['frosthaven'],
  'loot-deck': ['frosthaven'],
  'outpost-building-cards': ['frosthaven'],
  'battle-goals': ['frosthaven'],
  'personal-quests': ['frosthaven'],
  'pet-cards': ['frosthaven'],
  'world-map': ['frosthaven'],
  art: ['frosthaven']
};

function collect(): string[] {
  const images = new Set<string>();
  for (const [file, expansions] of Object.entries(wanted)) {
    const path = join(generated, `${file}.json`);
    if (!existsSync(path)) {
      throw new Error(`${path} missing; run pnpm data:sync first`);
    }
    const entries = JSON.parse(readFileSync(path, 'utf8')) as Entry[];
    for (const entry of entries) {
      if (expansions.includes(entry.expansion) && entry.image) {
        images.add(entry.image);
      }
    }
  }
  return [...images].sort();
}

async function download(image: string): Promise<'ok' | 'skip' | 'fail'> {
  const out = join(target, image);
  if (existsSync(out)) {
    return 'skip';
  }
  const url = `https://raw.githubusercontent.com/any2cards/worldhaven/${commit}/images/${image.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        return 'fail';
      }
      if (!res.ok) {
        throw new Error(`${res.status}`);
      }
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(await res.arrayBuffer()));
      return 'ok';
    } catch {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return 'fail';
}

const images = collect();
console.log(`${images.length} images -> ${target}`);
if (dryRun) {
  process.exit(0);
}

const counts = { ok: 0, skip: 0, fail: 0 };
const failed: string[] = [];
let index = 0;
async function worker() {
  while (index < images.length) {
    const image = images[index++]!;
    const result = await download(image);
    counts[result]++;
    if (result === 'fail') {
      failed.push(image);
    }
    const done = counts.ok + counts.skip + counts.fail;
    if (done % 250 === 0) {
      console.log(`  ${done}/${images.length}`);
    }
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'VERSION'), `${commit}\n`);
console.log(`downloaded ${counts.ok}, already present ${counts.skip}, failed ${counts.fail}`);
if (failed.length) {
  console.log(failed.slice(0, 20).join('\n'));
}
