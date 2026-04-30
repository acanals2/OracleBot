/**
 * Lightweight HTTP health server for orchestrator probes.
 *
 *   GET /healthz  →  200 always (process is alive)
 *   GET /readyz   →  200 if Redis PING succeeds AND DB select 1 succeeds
 *                    503 otherwise
 *
 * Railway hits /readyz; if it fails repeatedly, Railway restarts the service.
 * /healthz is for monitors that just want to know the process hasn't crashed.
 */
import { createServer, type Server } from 'node:http';
import { sql } from 'drizzle-orm';
import { db } from './db.js';
import { getConnection } from './queue-config.js';
import { logger } from './logger.js';

interface HealthOpts {
  port: number;
}

export function startHealthServer({ port }: HealthOpts): Server {
  const server = createServer(async (req, res) => {
    const url = req.url ?? '/';

    if (url === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url === '/readyz') {
      const checks = await runReadinessChecks();
      const ok = checks.redis === 'ok' && checks.db === 'ok';
      res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok, checks }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  server.listen(port, () => {
    logger.info({ event: 'health.listening', port }, 'health server listening');
  });

  return server;
}

interface Checks {
  redis: 'ok' | string;
  db: 'ok' | string;
}

async function runReadinessChecks(): Promise<Checks> {
  const [redis, db_] = await Promise.all([checkRedis(), checkDb()]);
  return { redis, db: db_ };
}

async function checkRedis(): Promise<'ok' | string> {
  try {
    const conn = getConnection() as unknown as { ping(): Promise<string> };
    const reply = await conn.ping();
    return reply === 'PONG' ? 'ok' : `unexpected:${reply}`;
  } catch (e) {
    return `error:${(e as Error).message}`;
  }
}

async function checkDb(): Promise<'ok' | string> {
  try {
    await db.execute(sql`select 1`);
    return 'ok';
  } catch (e) {
    return `error:${(e as Error).message}`;
  }
}
