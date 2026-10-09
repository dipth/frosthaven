/** Rebuilds generated/boards, images.json and books.json without re-syncing sources. */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoards } from './boards';
import { buildBooks } from './books';

const pkgRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
buildBoards(join(pkgRoot, 'generated'), join(pkgRoot, 'tile-calibration.json'));
buildBooks(join(pkgRoot, 'generated'));
