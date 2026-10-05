import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { GhsImportError } from '@fh/engine';
import Fastify, { type FastifyServerOptions } from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { authRoutes, SESSION_COOKIE } from './auth/routes';
import { AuthService } from './auth/service';
import { CampaignHub } from './campaigns/hub';
import { campaignRoutes } from './campaigns/routes';
import type { Db } from './db';
import type { User } from './db/schema';
import { env } from './env';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    sessionToken?: string;
  }
  interface FastifyContextConfig {
    /** Reachable without a session. */
    public?: boolean;
    /** Requires the admin role. */
    admin?: boolean;
  }
}

export interface AppOptions {
  db: Db;
  logger?: FastifyServerOptions['logger'];
  sessionSecret?: string;
  webDistDir?: string;
  assetsDir?: string;
  generatedDir?: string;
}

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 50 * 1024 * 1024, trustProxy: true });
  const auth = new AuthService(options.db);
  const hub = new CampaignHub(options.db, app.log);

  await app.register(cookie, { secret: options.sessionSecret ?? env.sessionSecret });
  await app.register(rateLimit, { global: false });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-robots-tag', 'noindex, nofollow');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'same-origin');
    reply.header('x-content-type-options', 'nosniff');

    const raw = req.cookies[SESSION_COOKIE];
    const unsigned = raw ? req.unsignCookie(raw) : undefined;
    if (unsigned?.valid && unsigned.value) {
      req.user = await auth.userForSession(unsigned.value);
      if (req.user) {
        req.sessionToken = unsigned.value;
      }
    }

    const config = req.routeOptions.config;
    if (config.public) {
      return;
    }
    if (!req.user) {
      const wantsPage = req.method === 'GET' && !req.url.startsWith('/api/') && !req.headers.upgrade;
      if (wantsPage) {
        return reply.redirect(`/login?next=${encodeURIComponent(req.url)}`);
      }
      return reply.code(401).send({ error: 'Not signed in' });
    }
    if (config.admin && req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Admins only' });
    }
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    if (error instanceof GhsImportError) {
      return reply.code(400).send({ error: error.message });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) {
      return reply.code(statusCode).send({ error: (error as Error).message });
    }
    req.log.error(error);
    return reply.code(500).send({ error: 'Internal error' });
  });

  app.get('/robots.txt', { config: { public: true } }, async (_req, reply) => reply.type('text/plain').send('User-agent: *\nDisallow: /\n'));
  app.get('/healthz', { config: { public: true } }, async () => ({ ok: true }));

  await app.register(authRoutes, { auth });
  await app.register(campaignRoutes, { db: options.db, hub });

  // Game data and images, signed-in users only.
  const generatedDir = options.generatedDir ?? env.generatedDir;
  await app.register(fastifyStatic, {
    root: generatedDir,
    prefix: '/game-data/',
    decorateReply: false,
    maxAge: '1h'
  });
  const assetsDir = options.assetsDir ?? env.assetsDir;
  if (existsSync(assetsDir)) {
    await app.register(fastifyStatic, { root: assetsDir, prefix: '/assets/', decorateReply: false, maxAge: '30d', immutable: true });
  }

  // The SPA, signed-in users only. Unknown non-API GETs fall back to index.html.
  const webDistDir = options.webDistDir ?? env.webDistDir;
  if (existsSync(join(webDistDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: webDistDir, prefix: '/', wildcard: false, index: ['index.html'] });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  return { app, auth, hub };
}
