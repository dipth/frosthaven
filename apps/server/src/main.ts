import { bootstrapGhsNode } from '@fh/ghs-core/node';
import { buildApp } from './app';
import { createDb } from './db';
import { env } from './env';

await bootstrapGhsNode(env.ghsDataDir);
const { db } = createDb();
const { app } = await buildApp({
  db,
  logger: env.production ? true : { transport: undefined, level: 'info' }
});
await app.listen({ port: env.port, host: env.host });
