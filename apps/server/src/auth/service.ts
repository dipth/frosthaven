import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { authSessions, invites, users, type User } from '../db/schema';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PublicUser = Pick<User, 'id' | 'username' | 'displayName' | 'role'>;

export function publicUser(user: User): PublicUser {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

export class AuthService {
  constructor(private readonly db: Db) {}

  async createUser(input: { username: string; displayName: string; password: string; role: 'admin' | 'player' }) {
    const [user] = await this.db
      .insert(users)
      .values({
        username: input.username.toLowerCase(),
        displayName: input.displayName,
        passwordHash: await hashPassword(input.password),
        role: input.role
      })
      .returning();
    return user!;
  }

  async login(username: string, password: string): Promise<{ user: User; token: string } | undefined> {
    const user = await this.db.query.users.findFirst({ where: eq(users.username, username.toLowerCase()) });
    // Verify against a dummy hash when the user doesn't exist to keep timing similar.
    dummyHash ??= hashPassword(randomToken());
    const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash), password);
    if (!user || !ok) {
      return undefined;
    }
    return { user, token: await this.createSession(user.id) };
  }

  async createSession(userId: string): Promise<string> {
    const token = randomToken();
    await this.db.insert(authSessions).values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
    return token;
  }

  async userForSession(token: string | undefined): Promise<User | undefined> {
    if (!token) {
      return undefined;
    }
    const row = await this.db
      .select({ user: users })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .where(and(eq(authSessions.id, sha256(token)), gt(authSessions.expiresAt, new Date())))
      .limit(1);
    return row[0]?.user;
  }

  async logout(token: string) {
    await this.db.delete(authSessions).where(eq(authSessions.id, sha256(token)));
  }

  async createInvite(input: { createdBy: string | null; role: 'admin' | 'player'; note?: string }) {
    const token = randomToken();
    const [invite] = await this.db
      .insert(invites)
      .values({
        tokenHash: sha256(token),
        role: input.role,
        note: input.note,
        createdBy: input.createdBy,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS)
      })
      .returning();
    return { invite: invite!, token };
  }

  async findValidInvite(token: string) {
    return this.db.query.invites.findFirst({
      where: and(eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt), gt(invites.expiresAt, new Date()))
    });
  }

  async acceptInvite(token: string, input: { username: string; displayName: string; password: string }) {
    return this.db.transaction(async (tx) => {
      const [invite] = await tx
        .update(invites)
        .set({ usedAt: new Date() })
        .where(and(eq(invites.tokenHash, sha256(token)), isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
        .returning();
      if (!invite) {
        return undefined;
      }
      const [user] = await tx
        .insert(users)
        .values({
          username: input.username.toLowerCase(),
          displayName: input.displayName,
          passwordHash: await hashPassword(input.password),
          role: invite.role
        })
        .returning();
      await tx.update(invites).set({ usedBy: user!.id }).where(eq(invites.id, invite.id));
      return user!;
    });
  }

  listUsers() {
    return this.db.select().from(users).orderBy(users.createdAt);
  }

  listInvites() {
    return this.db.select().from(invites).orderBy(invites.createdAt);
  }
}

/** Hash of a random string, verified against for unknown usernames to equalize timing. */
let dummyHash: Promise<string> | undefined;
