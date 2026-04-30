/**
 * Worker-side DB client. Mirrors the platform's lib/db pattern but lives here
 * so worker can deploy independently of the web app.
 *
 * Schema is duplicated from platform/lib/db/schema.ts at build time via
 * a copy step (see worker/Dockerfile + sync script). Keeping it as a copy
 * (rather than importing across packages) lets Railway build the worker
 * without needing the whole monorepo build context.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set in worker environment');

const sql = neon(url);
export const db = drizzle(sql, { schema });
export { schema };
export * from './schema.js';
