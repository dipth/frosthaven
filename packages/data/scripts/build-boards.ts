/** Rebuilds generated/boards and images.json without re-syncing sources. */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoards } from './boards';

const pkgRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
buildBoards(join(pkgRoot, 'generated'), join(pkgRoot, 'tile-calibration.json'));
