/** Global corrections to board tile images, edited from the board's admin edit mode. */
import type { TileOverride } from '@fh/engine';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from './db';
import { tileOverrides } from './db/schema';

const override = z.object({
  rotate180: z.boolean().optional(),
  dx: z.number().min(-500).max(500).optional(),
  dy: z.number().min(-500).max(500).optional(),
  scale: z.number().min(0.5).max(2).optional()
});
const nameParams = z.object({ name: z.string().regex(/^\d\d-[A-L]$/) });

export async function tileRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/api/tile-overrides', async () => {
    const rows = await db.select().from(tileOverrides);
    return Object.fromEntries(rows.map((r) => [r.name, r.override])) as Record<string, TileOverride>;
  });
  app.put('/api/admin/tile-overrides/:name', { config: { admin: true } }, async (req) => {
    const { name } = nameParams.parse(req.params);
    const value = override.parse(req.body);
    await db
      .insert(tileOverrides)
      .values({ name, override: value, updatedBy: req.user!.id })
      .onConflictDoUpdate({ target: tileOverrides.name, set: { override: value, updatedBy: req.user!.id, updatedAt: new Date() } });
    return { name, override: value };
  });
  app.delete('/api/admin/tile-overrides/:name', { config: { admin: true } }, async (req) => {
    const { name } = nameParams.parse(req.params);
    await db.delete(tileOverrides).where(eq(tileOverrides.name, name));
    return { ok: true };
  });
}
