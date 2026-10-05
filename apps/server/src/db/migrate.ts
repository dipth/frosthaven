import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { resolve } from 'node:path';
import { createDb } from './index';

export async function runMigrations(url?: string) {
  const { db, client } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, '../../drizzle') });
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runMigrations();
  console.log('migrations applied');
}
