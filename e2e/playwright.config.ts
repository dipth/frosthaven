import { defineConfig } from '@playwright/test';

export const E2E_PORT = 4173;
export const E2E_DB = process.env['E2E_DATABASE_URL'] ?? 'postgres://frosthaven:frosthaven@localhost:5433/frosthaven_e2e';

/**
 * Multi-user browser tests against the real server and the built web app
 * (`mise run e2e` builds it first). Uses its own database, frosthaven_e2e.
 */
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: { baseURL: `http://localhost:${E2E_PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: 'node --import tsx src/main.ts',
    cwd: '../apps/server',
    url: `http://localhost:${E2E_PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: E2E_DB,
      SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
      PORT: String(E2E_PORT),
      HOST: '127.0.0.1',
      BACKUP_DIR: '.e2e-backups'
    }
  }
});
