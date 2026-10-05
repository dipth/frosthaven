import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { invitePage, loginPage } from './pages';
import { AuthService, publicUser, SESSION_TTL_MS } from './service';

export const SESSION_COOKIE = 'fh_session';

const credentials = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) });
const newAccount = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_.-]{3,32}$/, 'Username must be 3-32 letters, digits, _ . -'),
  displayName: z.string().trim().min(1).max(40),
  password: z.string().min(10, 'Password must be at least 10 characters').max(256)
});

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: env.production,
    sameSite: 'lax',
    signed: true,
    maxAge: SESSION_TTL_MS / 1000
  });
}

export async function authRoutes(app: FastifyInstance, { auth }: { auth: AuthService }) {
  app.get('/login', { config: { public: true } }, async (req, reply) => {
    if (req.user) {
      return reply.redirect('/');
    }
    return reply.type('text/html').send(loginPage());
  });

  app.get('/invite/:token', { config: { public: true } }, async (req, reply) => {
    const { token } = z.object({ token: z.string().max(100) }).parse(req.params);
    const invite = await auth.findValidInvite(token);
    return reply.type('text/html').send(invitePage(token, !!invite));
  });

  app.post(
    '/api/auth/login',
    { config: { public: true, rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const parsed = credentials.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Username and password are required' });
      }
      const result = await auth.login(parsed.data.username, parsed.data.password);
      if (!result) {
        return reply.code(401).send({ error: 'Wrong username or password' });
      }
      setSessionCookie(reply, result.token);
      return publicUser(result.user);
    }
  );

  app.post(
    '/api/invites/:token/accept',
    { config: { public: true, rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().max(100) }).parse(req.params);
      const parsed = newAccount.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid input' });
      }
      try {
        const user = await auth.acceptInvite(token, parsed.data);
        if (!user) {
          return reply.code(410).send({ error: 'This invite has expired or was already used' });
        }
        setSessionCookie(reply, await auth.createSession(user.id));
        return publicUser(user);
      } catch (error) {
        if ((error as { code?: string }).code === '23505' || (error as { cause?: { code?: string } }).cause?.code === '23505') {
          return reply.code(409).send({ error: 'That username is taken' });
        }
        throw error;
      }
    }
  );

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.sessionToken) {
      await auth.logout(req.sessionToken);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req) => publicUser(req.user!));

  app.get('/api/users', async () => (await auth.listUsers()).map(publicUser));

  app.get('/api/admin/invites', { config: { admin: true } }, async () => {
    const invites = await auth.listInvites();
    return invites.map(({ tokenHash: _tokenHash, ...invite }) => invite);
  });

  app.post('/api/admin/invites', { config: { admin: true } }, async (req) => {
    const { role, note } = z
      .object({ role: z.enum(['admin', 'player']).default('player'), note: z.string().max(200).optional() })
      .parse(req.body ?? {});
    const { invite, token } = await auth.createInvite({ createdBy: req.user!.id, role, note });
    const origin = `${req.protocol}://${req.host}`;
    return { id: invite.id, expiresAt: invite.expiresAt, url: `${origin}/invite/${token}` };
  });
}
