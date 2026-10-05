import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { normalizeGameModel, type ServerMessage } from '@fh/engine';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import type { AuthService } from '../src/auth/service';
import { createDb } from '../src/db';
import { runMigrations } from '../src/db/migrate';

const url = process.env['TEST_DATABASE_URL'] ?? 'postgres://frosthaven:frosthaven@localhost:5433/frosthaven_test';
const { db, client } = createDb(url);
let app: FastifyInstance;
let auth: AuthService;

async function signIn(username: string, role: 'admin' | 'player' = 'player') {
  await auth.createUser({ username, displayName: username.toUpperCase(), password: 'correct horse battery', role });
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password: 'correct horse battery' } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'fh_session')!;
  return `fh_session=${cookie.value}`;
}

function nextMessage(ws: WebSocket | import('ws').WebSocket, predicate: (m: ServerMessage) => boolean): Promise<ServerMessage> {
  return new Promise((resolve) => {
    const handler = (data: unknown) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (predicate(message)) {
        (ws as import('ws').WebSocket).off('message', handler);
        resolve(message);
      }
    };
    (ws as import('ws').WebSocket).on('message', handler);
  });
}

beforeAll(async () => {
  await runMigrations(url);
  await bootstrapGhsNode();
  ({ app, auth } = await buildApp({ db, logger: false, sessionSecret: 'test-secret-test-secret-test-secret', webDistDir: '/nonexistent' }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await client.end();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, invites, auth_sessions, campaigns, play_sessions, events, imports CASCADE`);
});

describe('privacy', () => {
  it('rejects anonymous requests', async () => {
    expect((await app.inject('/api/campaigns')).statusCode).toBe(401);
    expect((await app.inject('/game-data/ghs/fh.json')).statusCode).toBe(302);
    const page = await app.inject('/campaigns/123');
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe('/login?next=%2Fcampaigns%2F123');
    expect(page.headers['x-robots-tag']).toContain('noindex');
    expect((await app.inject('/login')).statusCode).toBe(200);
    expect((await app.inject('/robots.txt')).body).toContain('Disallow: /');
  });

  it('rejects a forged session cookie', async () => {
    const res = await app.inject({ url: '/api/auth/me', headers: { cookie: 'fh_session=abc.def' } });
    expect(res.statusCode).toBe(401);
  });

  it('only lets admins create invites, and invites are single-use', async () => {
    const player = await signIn('bob');
    expect((await app.inject({ method: 'POST', url: '/api/admin/invites', headers: { cookie: player }, payload: {} })).statusCode).toBe(403);

    const admin = await signIn('alice', 'admin');
    const created = await app.inject({ method: 'POST', url: '/api/admin/invites', headers: { cookie: admin }, payload: {} });
    expect(created.statusCode).toBe(200);
    const token = (created.json().url as string).split('/invite/')[1]!;

    const accept = () =>
      app.inject({
        method: 'POST',
        url: `/api/invites/${token}/accept`,
        payload: { username: 'carol', displayName: 'Carol', password: 'a long enough password' }
      });
    const first = await accept();
    expect(first.statusCode).toBe(200);
    expect(first.cookies.some((c) => c.name === 'fh_session')).toBe(true);
    expect((await accept()).statusCode).toBe(410);
  });
});

describe('campaigns', () => {
  it('runs commands over the websocket and broadcasts state', async () => {
    const alice = await signIn('alice', 'admin');
    const bob = await signIn('bob');
    const { id } = (await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: alice }, payload: { name: 'Frozen Few' } })).json();

    const wsA = await app.injectWS(`/api/campaigns/${id}/ws`, { headers: { cookie: alice } });
    const wsB = await app.injectWS(`/api/campaigns/${id}/ws`, { headers: { cookie: bob } });

    const bobSees = nextMessage(wsB, (m) => m.t === 'state' && m.revision === 1);
    const ack = nextMessage(wsA, (m) => m.t === 'ack' || m.t === 'reject');
    wsA.send(JSON.stringify({ t: 'cmd', id: 'c1', type: 'character.add', payload: { edition: 'fh', name: 'drifter' } }));
    expect(await ack).toEqual({ t: 'ack', id: 'c1', revision: 1 });
    const state = await bobSees;
    expect(state.t === 'state' && state.state.ghs.characters.map((c) => c.name)).toEqual(['drifter']);

    // Bob may not set Alice's character's initiative.
    const reject = nextMessage(wsB, (m) => m.t === 'reject');
    wsB.send(JSON.stringify({ t: 'cmd', id: 'c2', type: 'character.initiative', payload: { edition: 'fh', name: 'drifter', initiative: 10 } }));
    expect(await reject).toMatchObject({ code: 'forbidden' });

    // Undo restores the previous state.
    const undone = nextMessage(wsA, (m) => m.t === 'state' && m.revision === 2);
    wsA.send(JSON.stringify({ t: 'undo', id: 'u1' }));
    const after = await undone;
    expect(after.t === 'state' && after.state.ghs.characters).toEqual([]);

    const log = (await app.inject({ url: `/api/campaigns/${id}/events`, headers: { cookie: alice } })).json();
    expect(log.map((e: { type: string }) => e.type)).toEqual(['system.undo', 'character.add']);
    wsA.terminate();
    wsB.terminate();
  });

  it('imports a GHS game and exports it back unchanged', async () => {
    const alice = await signIn('alice', 'admin');
    const { id } = (await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: alice }, payload: { name: 'Source' } })).json();
    const ws = await app.injectWS(`/api/campaigns/${id}/ws`, { headers: { cookie: alice } });
    const done = nextMessage(ws, (m) => m.t === 'ack' || m.t === 'reject');
    ws.send(JSON.stringify({ t: 'cmd', id: 'c1', type: 'character.add', payload: { edition: 'fh', name: 'geminate' } }));
    expect(await done).toMatchObject({ t: 'ack' });
    ws.terminate();

    const exported = (await app.inject({ url: `/api/campaigns/${id}/export?format=datadump`, headers: { cookie: alice } })).json();
    expect(Object.keys(exported).sort()).toEqual(['game', 'game-backup', 'redo', 'settings', 'undo', 'undo-infos']);

    const imported = await app.inject({
      method: 'POST',
      url: '/api/campaigns/import',
      headers: { cookie: alice },
      payload: { filename: 'dump.json', data: exported }
    });
    expect(imported.statusCode).toBe(201);
    const reExported = (await app.inject({ url: `/api/campaigns/${imported.json().id}/export`, headers: { cookie: alice } })).json();
    // Importing runs GHS' own load-time migrations, exactly as loading the file into GHS would.
    const { revision: _r1, ...a } = normalizeGameModel(exported.game);
    const { revision: _r2, ...b } = reExported;
    expect(b).toEqual(a);
    expect(reExported.characters.map((c: { name: string }) => c.name)).toEqual(['geminate']);
  });

  it('rejects files that are not GHS exports', async () => {
    const alice = await signIn('alice', 'admin');
    const res = await app.inject({ method: 'POST', url: '/api/campaigns/import', headers: { cookie: alice }, payload: { data: { hello: 1 } } });
    expect(res.statusCode).toBe(400);
  });
});
