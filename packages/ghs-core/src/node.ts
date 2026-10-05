/** Node entry point: bootstraps GHS from packages/data/generated/ghs. */
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootstrapGhs } from './bootstrap';

export * from './index';

const defaultDataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../data/generated/ghs');

export function bootstrapGhsNode(dataDir: string = process.env['GHS_DATA_DIR'] ?? defaultDataDir) {
  return bootstrapGhs(async (file) => JSON.parse(await readFile(join(dataDir, file), 'utf8')));
}
