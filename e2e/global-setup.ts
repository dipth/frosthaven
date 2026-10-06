/** Fresh e2e database with two players: alice (admin) and bob. */
import { AuthService } from '../apps/server/src/auth/service';
import { createDb } from '../apps/server/src/db';
import { runMigrations } from '../apps/server/src/db/migrate';
import { E2E_DB } from './playwright.config';

export const PASSWORD = 'e2e correct horse battery';

export default async function globalSetup() {
  const url = new URL(E2E_DB);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  const { client: admin } = createDb(url.toString());
  const exists = await admin`select 1 from pg_database where datname = ${name}`;
  if (!exists.length) await admin.unsafe(`create database "${name}"`);
  await admin.end();

  await runMigrations(E2E_DB);
  const { db, client } = createDb(E2E_DB);
  await client.unsafe('TRUNCATE users, invites, auth_sessions, campaigns, play_sessions, events, imports, tile_overrides CASCADE');
  const auth = new AuthService(db);
  await auth.createUser({ username: 'alice', displayName: 'Alice', password: PASSWORD, role: 'admin' });
  await auth.createUser({ username: 'bob', displayName: 'Bob', password: PASSWORD, role: 'player' });
  await client.end();
}
