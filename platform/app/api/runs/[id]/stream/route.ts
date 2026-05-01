/**
 * Server-Sent Events stream for live run telemetry (authenticated).
 *
 *   GET /api/runs/[id]/stream
 *     ?metricSince=<lastMetricId>
 *     &eventSince=<lastEventId>
 *     &findingSince=<ISO timestamp>
 *
 * Auth: requireSession + run.orgId == session.org.id.
 *
 * Polling loop, framing, and lifecycle are shared with the public
 * spectator route at /api/share/[token]/stream — see lib/run-stream.ts.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runs } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { apiError } from '@/lib/api-helpers';
import { NotFoundError } from '@/lib/errors';
import { logger, newTraceId } from '@/lib/logger';
import { openRunStream, parseCursors } from '@/lib/run-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/runs/[id]/stream' });

  const { id: runId } = await ctx.params;

  try {
    const session = await requireSession();
    const run = await db.query.runs.findFirst({
      where: and(eq(runs.id, runId), eq(runs.orgId, session.org.id)),
      columns: { id: true },
    });
    if (!run) throw new NotFoundError('Run not found', { runId }, traceId);
  } catch (e) {
    return apiError(e, { traceId, context: { runId } });
  }

  const cursors = parseCursors(req);
  const { stream, headers } = openRunStream({ runId, cursors, traceId, log });
  return new Response(stream, { headers });
}
