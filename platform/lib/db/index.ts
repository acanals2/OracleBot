/**
 * Drizzle client (Neon serverless).
 *
 * Use this for all DB access from server components and API routes:
 *   import { db } from '@/lib/db';
 *   import { runs } from '@/lib/db/schema';
 *   const myRun = await db.query.runs.findFirst({ where: eq(runs.id, id) });
 *
 * The client is built lazily on first access — Neon's URL parser rejects
 * malformed strings, and Next.js evaluates module bodies during build-time
 * page-data collection (even for dynamic API routes that never run at build).
 * Eager construction with a fake fallback URL crashes the build, so we defer
 * until the first actual query.
 */
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

let _client: DrizzleClient | null = null;
let _sql: NeonQueryFunction<false, false> | null = null;

function getClient(): DrizzleClient {
  if (_client) return _client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to platform/.env.local before any DB call.',
    );
  }
  _sql = neon(url);
  _client = drizzle(_sql, { schema, logger: process.env.NODE_ENV === 'development' });
  return _client;
}

/**
 * Proxy that defers client construction until first access. The proxy
 * forwards every property/method to the real Drizzle client, including
 * the `query.<table>.findFirst()` chain — but only after env vars are
 * confirmed present. This lets `import { db } from '@/lib/db'` succeed
 * at module-load time even when DATABASE_URL is missing (e.g. during a
 * Vercel build that hasn't injected runtime secrets yet).
 */
export const db = new Proxy({} as DrizzleClient, {
  get(_target, prop: string | symbol) {
    const real = getClient() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? (value as Function).bind(real) : value;
  },
});

export { schema };
export * from './schema';
