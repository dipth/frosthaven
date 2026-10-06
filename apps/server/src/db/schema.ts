import { sql } from 'drizzle-orm';
import { bigserial, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { CampaignState, CommandLog, SessionMode, TileOverride } from '@fh/engine';

export const roleEnum = pgEnum('role', ['admin', 'player']);
export const sessionModeEnum = pgEnum('session_mode', ['physical', 'online']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('player'),
  createdAt: createdAt()
});

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  role: roleEnum('role').notNull().default('player'),
  note: text('note'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt()
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(), // sha256 of the cookie token
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt()
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)]
);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  state: jsonb('state').$type<CampaignState>().notNull(),
  revision: integer('revision').notNull().default(0),
  /** State of the physical box as of the last "mark synced"; null = never synced. */
  physicalBaseline: jsonb('physical_baseline').$type<CampaignState>(),
  baselineRevision: integer('baseline_revision'),
  /** GHS settings from the dump the campaign was imported from, reused on export. */
  ghsSettings: jsonb('ghs_settings').$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const playSessions = pgTable(
  'play_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    mode: sessionModeEnum('mode').notNull(),
    startedBy: uuid('started_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true })
  },
  (t) => [index('play_sessions_campaign_idx').on(t.campaignId)]
);

export const events = pgTable(
  'events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    playSessionId: uuid('play_session_id').references(() => playSessions.id, { onDelete: 'set null' }),
    /** Campaign revision after this event was applied. */
    revision: integer('revision').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    log: jsonb('log').$type<CommandLog>().notNull(),
    /** State before this event; kept for the most recent events only (undo). */
    stateBefore: jsonb('state_before').$type<CampaignState>(),
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (t) => [index('events_campaign_revision_idx').on(t.campaignId, t.revision)]
);

export const imports = pgTable('imports', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  filename: text('filename'),
  kind: text('kind').notNull(),
  raw: jsonb('raw').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt()
});

/** Global corrections to board tile images (see TileOverride), keyed by tile name, e.g. "13-A". */
export const tileOverrides = pgTable('tile_overrides', {
  name: text('name').primaryKey(),
  override: jsonb('override').$type<TileOverride>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export type User = typeof users.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type { SessionMode };
export const nowSql = sql`now()`;
