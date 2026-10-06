/**
 * Campaign backups on the data volume: for each campaign whose revision
 * changed since its last backup, a GHS data dump (importable into
 * Secretariat) and the app's full state. Runs at startup and every few hours
 * while the machine is up; keeps the newest KEEP backups per campaign.
 */
import { exportGhsDatadump, type CampaignState } from '@fh/engine';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Db } from './db';
import { campaigns } from './db/schema';

const KEEP = 30;
const INTERVAL = 6 * 60 * 60 * 1000;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign';

export interface BackupFile {
  campaign: string;
  file: string;
  revision: number;
  createdAt: string;
}

function revisionOf(file: string) {
  return Number(/-r(\d+)\./.exec(file)?.[1] ?? -1);
}

export async function runBackups(db: Db, dir: string, log?: FastifyBaseLogger): Promise<number> {
  const rows = await db.select({ id: campaigns.id, name: campaigns.name, state: campaigns.state, revision: campaigns.revision, ghsSettings: campaigns.ghsSettings }).from(campaigns);
  let written = 0;
  for (const row of rows) {
    const folder = join(dir, `${slug(row.name)}-${row.id.slice(0, 8)}`);
    mkdirSync(folder, { recursive: true });
    const existing = readdirSync(folder).filter((f) => f.endsWith('.ghs.json'));
    if (existing.some((f) => revisionOf(f) === row.revision)) continue;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `${stamp}-r${row.revision}`;
    writeFileSync(join(folder, `${base}.ghs.json`), JSON.stringify(exportGhsDatadump(row.state as CampaignState, row.ghsSettings ?? undefined)));
    writeFileSync(join(folder, `${base}.app.json`), JSON.stringify({ name: row.name, revision: row.revision, state: row.state }));
    written++;
    const backups = [...existing, `${base}.ghs.json`].sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
      rmSync(join(folder, old), { force: true });
      rmSync(join(folder, old.replace('.ghs.json', '.app.json')), { force: true });
    }
  }
  if (written) log?.info({ written, dir }, 'campaign backups written');
  return written;
}

export function listBackups(dir: string): BackupFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(dir, d.name))
        .filter((f) => f.endsWith('.json'))
        .map((file) => ({ campaign: d.name, file, revision: revisionOf(file), createdAt: file.slice(0, 19).replace(/T(\d\d)-(\d\d)-(\d\d)/, 'T$1:$2:$3') }))
    )
    .sort((a, b) => b.file.localeCompare(a.file));
}

export function scheduleBackups(db: Db, dir: string, log: FastifyBaseLogger) {
  const run = () => runBackups(db, dir, log).catch((error) => log.error({ error }, 'backup failed'));
  setTimeout(run, 30_000).unref();
  setInterval(run, INTERVAL).unref();
}

const fileParams = z.object({ campaign: z.string().regex(/^[a-z0-9-]+$/), file: z.string().regex(/^[\w.-]+\.json$/) });

export async function backupRoutes(app: FastifyInstance, { db, dir }: { db: Db; dir: string }) {
  app.get('/api/admin/backups', { config: { admin: true } }, async () => listBackups(dir));
  app.post('/api/admin/backups', { config: { admin: true } }, async () => ({ written: await runBackups(db, dir, app.log) }));
  app.get('/api/admin/backups/:campaign/:file', { config: { admin: true } }, async (req, reply) => {
    const { campaign, file } = fileParams.parse(req.params);
    const path = join(dir, campaign, file);
    if (!existsSync(path)) return reply.code(404).send({ error: 'Not found' });
    return reply.header('content-disposition', `attachment; filename="${campaign}_${file}"`).type('application/json').send(readFileSync(path));
  });
}
