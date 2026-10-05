/**
 * Fetches the pinned upstream data sources (see ../sources.json) and writes
 * normalized output to ../generated. Safe to re-run; sources are cached in
 * <repo>/.cache/sources.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOfficialCrossover } from './crossover';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const repoRoot = resolve(pkgRoot, '../..');
const cacheDir = join(repoRoot, '.cache/sources');
const outDir = join(pkgRoot, 'generated');

type Sources = {
  ghs: { repo: string; commit: string; editions: string[] };
  fhtts: { repo: string; commit: string; files: string[] };
  worldhaven: { repo: string; commit: string; dataFiles: string[] };
};

const sources: Sources = JSON.parse(readFileSync(join(pkgRoot, 'sources.json'), 'utf8'));

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
}

/** Shallow, sparse checkout of `repo` at `commit` into `dir`. */
function sparseCheckout(dir: string, repo: string, commit: string, paths: string[]) {
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dir, { recursive: true });
    git(dir, 'init', '-q');
    git(dir, 'remote', 'add', 'origin', repo);
  }
  git(dir, 'sparse-checkout', 'set', '--no-cone', ...paths);
  const current = existsSync(join(dir, '.git/HEAD')) ? safeHead(dir) : undefined;
  if (current !== commit) {
    console.log(`  fetching ${repo}@${commit.slice(0, 8)}`);
    git(dir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', commit);
    git(dir, 'checkout', '-q', '--force', commit);
  } else {
    git(dir, 'checkout', '-q', '--force', commit);
  }
}

function safeHead(dir: string): string | undefined {
  try {
    return git(dir, 'rev-parse', 'HEAD');
  } catch {
    return undefined;
  }
}

async function fetchRaw(repo: string, commit: string, path: string): Promise<string> {
  const slug = repo.replace('https://github.com/', '').replace(/\.git$/, '');
  const url = `https://raw.githubusercontent.com/${slug}/${commit}/${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  return res.text();
}

async function cachedRaw(name: string, repo: string, commit: string, path: string): Promise<string> {
  const file = join(cacheDir, name, commit, path);
  if (existsSync(file)) {
    return readFileSync(file, 'utf8');
  }
  const text = await fetchRaw(repo, commit, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return text;
}

// ---------------------------------------------------------------------------
// GHS edition data: same shape as GHS scripts/build-data.js output, English only
// ---------------------------------------------------------------------------

function readJson(path: string, fallback: unknown) {
  if (!existsSync(path)) {
    return fallback;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readFolder(dir: string): unknown[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
}

type Indexed = { index: string; edition: string; group?: string };

function mergeIndexed(base: Indexed[], extra: Indexed[]): Indexed[] {
  const result = [...base];
  for (const item of extra) {
    const existing = result.findIndex((s) => s.index == item.index && s.edition == item.edition && s.group == item.group);
    if (existing >= 0) {
      result.splice(existing, 1, item);
    } else {
      result.push(item);
    }
  }
  return result.sort((a, b) => {
    if (!a.group && b.group) return -1;
    if (a.group && !b.group) return 1;
    if (a.group && b.group && a.group != b.group) return a.group.toLowerCase() < b.group.toLowerCase() ? -1 : 1;
    const an = a.index.match(/(\d+)/);
    const bn = b.index.match(/(\d+)/);
    if (an && bn) return +an[0] - +bn[0];
    return a.index.toLowerCase() < b.index.toLowerCase() ? -1 : 1;
  });
}

function buildEdition(editionPath: string, edition: string): Record<string, unknown> {
  const data = readJson(join(editionPath, 'base.json'), {}) as Record<string, unknown>;
  data['edition'] ??= edition;
  data['conditions'] ??= [];
  data['extensions'] ??= [];
  data['characters'] = readFolder(join(editionPath, 'character'));
  data['decks'] = [...readFolder(join(editionPath, 'character/deck')), ...readFolder(join(editionPath, 'monster/deck'))];
  data['monsters'] = readFolder(join(editionPath, 'monster'));
  data['battleGoals'] = readJson(join(editionPath, 'battle-goals.json'), []);
  data['events'] = readJson(join(editionPath, 'events.json'), []);
  data['personalQuests'] = readJson(join(editionPath, 'personal-quests.json'), []);
  const campaign = readJson(join(editionPath, 'campaign.json'), undefined) as Record<string, unknown> | undefined;
  if (campaign) {
    campaign['buildings'] = readJson(join(editionPath, 'buildings.json'), undefined);
  }
  data['campaign'] = campaign;
  data['challenges'] = readJson(join(editionPath, 'challenges.json'), []);
  data['trials'] = readJson(join(editionPath, 'trials.json'), []);
  data['favors'] = readJson(join(editionPath, 'favors.json'), []);
  data['pets'] = readJson(join(editionPath, 'pets.json'), []);
  data['scenarios'] = mergeIndexed(
    readJson(join(editionPath, 'scenarios.json'), []) as Indexed[],
    readFolder(join(editionPath, 'scenarios')) as Indexed[]
  );
  data['sections'] = mergeIndexed(
    readJson(join(editionPath, 'sections.json'), []) as Indexed[],
    readFolder(join(editionPath, 'sections')) as Indexed[]
  );
  data['items'] = readJson(join(editionPath, 'items.json'), []);
  data['treasures'] = readJson(join(editionPath, 'treasures.json'), []);
  data['label'] = { en: readJson(join(editionPath, 'label/en.json'), {}) };
  data['labelSpoiler'] = { en: readJson(join(editionPath, 'label/spoiler/en.json'), {}) };
  data['labelEvents'] = { en: readJson(join(editionPath, 'label/events/en.json'), {}) };
  return data;
}

async function syncGhs() {
  console.log('GHS');
  const dir = join(cacheDir, 'ghs');
  const { repo, commit, editions } = sources.ghs;
  sparseCheckout(dir, repo, commit, [
    ...editions.map((e) => `/data/${e}/`),
    '/src/app/game/',
    // The UI is not used at runtime; it's the reference for how each action is performed.
    '/src/app/ui/',
    '/src/assets/locales/en.json',
    '/LICENSE'
  ]);

  const target = join(outDir, 'ghs');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const built = Object.fromEntries(editions.map((edition) => [edition, buildEdition(join(dir, 'data', edition), edition)]));
  console.log(`  official crossover sheets applied to ${applyOfficialCrossover(built)} classes`);
  for (const edition of editions) {
    const data = built[edition]!;
    writeFileSync(join(target, `${edition}.json`), JSON.stringify(data));
    const counts = ['characters', 'monsters', 'scenarios', 'sections', 'items', 'events']
      .map((k) => `${k}=${(data[k] as unknown[] | undefined)?.length ?? 0}`)
      .join(' ');
    console.log(`  ${edition}: ${counts}`);
  }
  writeFileSync(join(target, 'locale-en.json'), readFileSync(join(dir, 'src/assets/locales/en.json')));
}

async function syncFhtts() {
  console.log('fhtts');
  const { repo, commit, files } = sources.fhtts;
  const target = join(outDir, 'fhtts');
  mkdirSync(target, { recursive: true });
  for (const file of files) {
    const text = await cachedRaw('fhtts', repo, commit, file);
    const name = file.split('/').pop()!;
    writeFileSync(join(target, name), JSON.stringify(JSON.parse(text)));
    console.log(`  ${name}`);
  }
}

type WorldhavenEntry = { name: string; expansion: string; image: string; xws: string; [key: string]: unknown };

const worldhavenExpansions = new Set(['frosthaven', 'gloomhaven', 'forgotten circles', 'jaws of the lion']);

async function syncWorldhaven() {
  console.log('worldhaven');
  const { repo, commit, dataFiles } = sources.worldhaven;
  const target = join(outDir, 'worldhaven');
  mkdirSync(target, { recursive: true });
  for (const file of dataFiles) {
    const text = await cachedRaw('worldhaven', repo, commit, `data/${file}`);
    const entries = (JSON.parse(text) as WorldhavenEntry[]).filter((e) => worldhavenExpansions.has(e.expansion));
    const name = file.replace(/\.js$/, '.json');
    writeFileSync(join(target, name), JSON.stringify(entries));
    console.log(`  ${name}: ${entries.length}`);
  }
}

mkdirSync(outDir, { recursive: true });
await syncGhs();
await syncFhtts();
await syncWorldhaven();
writeFileSync(join(outDir, 'sources.json'), JSON.stringify(sources, null, 2));
console.log('done ->', outDir);
