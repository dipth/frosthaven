/**
 * Copies Gloomhaven Secretariat's framework-independent game logic
 * (src/app/game) from the pinned checkout in .cache/sources/ghs into
 * src/vendor/game, rewriting absolute `src/app/...` imports to relative ones
 * and redirecting browser/Angular-only modules to ../shims.
 *
 * Run `pnpm data:sync` first so the checkout exists at the pinned commit.
 * Code under src/vendor is AGPL-3.0 (c) Lurkars and contributors.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const repoRoot = resolve(pkgRoot, '../..');
const ghsRoot = join(repoRoot, '.cache/sources/ghs');
const sourceDir = join(ghsRoot, 'src/app/game');
const vendorRoot = join(pkgRoot, 'src/vendor');
const targetDir = join(vendorRoot, 'game');
const shimDir = join(pkgRoot, 'src/shims');

const sources = JSON.parse(readFileSync(join(repoRoot, 'packages/data/sources.json'), 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ghsRoot }).toString().trim();
if (head !== sources.ghs.commit) {
  throw new Error(`GHS checkout is at ${head}, expected ${sources.ghs.commit}. Run pnpm data:sync first.`);
}

/** Files replaced by shims (they depend on IndexedDB, WebSocket or Angular DI). */
const replaced: Record<string, string> = {
  'src/app/game/businesslogic/StateManager': 'StateManager',
  'src/app/game/businesslogic/StorageManager': 'StorageManager',
  'src/app/ui/helper/Static': 'Static',
  'src/app/ui/helper/android-fullscreen': 'android-fullscreen'
};
const skippedFiles = new Set(['businesslogic/StateManager.ts', 'businesslogic/StorageManager.ts', 'businesslogic/GhsManager.ts', 'commands/commandsTestHelpers.ts']);

const packageShims: Record<string, string> = {
  '@angular/core': 'angular-core',
  '@angular/cdk/drag-drop': 'angular-cdk-drag-drop',
  '@angular/common': 'angular-common',
  '@angular/common/locales/de': 'angular-locale',
  '@angular/common/locales/fr': 'angular-locale',
  '@angular/common/locales/ko': 'angular-locale',
  '@capacitor/core': 'capacitor-core'
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function relativeImport(fromFile: string, toFile: string) {
  let rel = relative(dirname(fromFile), toFile).replaceAll('\\', '/');
  if (!rel.startsWith('.')) {
    rel = './' + rel;
  }
  return rel;
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });

let count = 0;
for (const file of walk(sourceDir)) {
  const rel = relative(sourceDir, file);
  if (!file.endsWith('.ts') || file.endsWith('.spec.ts') || skippedFiles.has(rel)) {
    continue;
  }
  const target = join(targetDir, rel);
  let code = readFileSync(file, 'utf8');
  code = code.replace(/(from |import\()'([^']+)'/g, (match, prefix: string, spec: string) => {
    if (replaced[spec]) {
      return `${prefix}'${relativeImport(target, join(shimDir, replaced[spec]))}'`;
    }
    if (packageShims[spec]) {
      return `${prefix}'${relativeImport(target, join(shimDir, packageShims[spec]))}'`;
    }
    if (spec.startsWith('src/app/game/')) {
      return `${prefix}'${relativeImport(target, join(targetDir, spec.slice('src/app/game/'.length)))}'`;
    }
    if (spec.startsWith('src/')) {
      throw new Error(`Unhandled import ${spec} in ${rel}`);
    }
    return match;
  });
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `// Vendored from Gloomhaven Secretariat @ ${head.slice(0, 12)} (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.\n${code}`);
  count++;
}

cpSync(join(ghsRoot, 'LICENSE'), join(vendorRoot, 'LICENSE'));
writeFileSync(join(vendorRoot, 'VERSION'), `${head}\n`);
console.log(`vendored ${count} files from GHS @ ${head}`);
