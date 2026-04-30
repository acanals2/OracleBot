/**
 * Admin-only DLQ inspection endpoint.
 *
 * Returns the most recent jobs that exhausted their retry attempts and were
 * persisted to the `dead_jobs` table by the worker. Gated to org-owner role
 * for now — once Phase 13 (RBAC) lands this should move to a dedicated
 * "platform-admin" role on a global users table.
 *
 *   GET /api/admin/dead-jobs?queue=run-execution&limit=50
 */
import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { deadJobs } from '@/lib/db/schema';
import { requireSession, UnauthenticatedError, NoActiveOrgError, NotInOrgError } from '@/lib/auth';
import { ForbiddenError } from '@/lib/errors';
import { logger, newTraceId } from '@/lib/logger';

const MAX_LIMIT = 200;

export async function GET(req: Request) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/admin/dead-jobs' });

  try {
    const session = await requireSession();
    if (session.role !== 'owner') {
      throw new ForbiddenError('Owner role required to view dead jobs', {}, traceId);
    }

    const { searchParams } = new URL(req.url);
    const queue = searchParams.get('queue') ?? undefined;
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), MAX_LIMIT);

    const rows = await db
      .select()
      .from(deadJobs)
      .where(queue ? eq(deadJobs.queue, queue) : undefined)
      .orderBy(desc(deadJobs.createdAt))
      .limit(limit);

    log.info({ event: 'admin.dead_jobs.listed', count: rows.length, queue }, 'listed dead jobs');
    return NextResponse.json({ deadJobs: rows, traceId });
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: { code: 'unauthorized', traceId } }, { status: 401 });
    }
    if (e instanceof NoActiveOrgError || e instanceof NotInOrgError || e instanceof ForbiddenError) {
      return NextResponse.json({ error: { code: 'forbidden', traceId } }, { status: 403 });
    }
    log.error({ event: 'admin.dead_jobs.error', err: (e as Error).message }, 'unexpected error');
    return NextResponse.json({ error: { code: 'internal', traceId } }, { status: 500 });
  }
}
