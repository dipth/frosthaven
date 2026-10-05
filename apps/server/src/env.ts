import { resolve } from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

const repoRoot = resolve(import.meta.dirname, '../../..');

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  port: Number(process.env['PORT'] ?? 3000),
  host: process.env['HOST'] ?? '0.0.0.0',
  production: process.env['NODE_ENV'] === 'production',
  assetsDir: resolve(repoRoot, process.env['ASSETS_DIR'] ?? '.assets'),
  ghsDataDir: resolve(repoRoot, process.env['GHS_DATA_DIR'] ?? 'packages/data/generated/ghs'),
  generatedDir: resolve(repoRoot, process.env['GENERATED_DIR'] ?? 'packages/data/generated'),
  webDistDir: resolve(repoRoot, process.env['WEB_DIST_DIR'] ?? 'apps/web/dist')
};
