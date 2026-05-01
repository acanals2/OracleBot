/**
 * Server-Sent Events stream for live run telemetry.
 *
 *   GET /api/runs/[id]/stream
 *     ?metricSince=<lastMetricId>
 *     &eventSince=<lastEventId>
 *     &findingSince=<ISO timestamp>
 *
 * Emits SSE messages of the following named event types:
 *   - metric    payload: RunMetric row
 *   - event     payload: RunEvent row
 *   - finding   payload: RunFinding row
 *   - status    payload: { status: RunStatus }
 *   - heartbeat payload: { now: ISO }   (every 5s, defeats reverse-proxy buffering)
 *   - done      payload: { reason: 'terminal' | 'timeout' }
 *
 * The handler self-terminates after ~9 seconds to stay under Vercel's Hobby
 * 10s function-duration cap. The client (LiveStream) reconnects automatically
 * with updated cursors until the run reaches a terminal status.
 */
import { eq, and, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { runs, runEvents, runFindings, runMetrics } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth';
import { apiError } from '@/lib/api-helpers';
import { NotFoundError } from '@/lib/errors';
import { logger, newTraceId } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Keep the handler well under Vercel Hobby's 10s ceiling. Client reconnects.
const MAX_DURATION_MS = 9_000;
const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_INTERVAL_MS = 5_000;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled', 'timed_out']);

function sseFrame(eventName: string, data: unknown, id?: string): string {
  let frame = `event: ${eventName}\n`;
  if (id) frame += `id: ${id}\n`;
  frame += `data: ${JSON.stringify(data)}\n\n`;
  return frame;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/runs/[id]/stream' });

  const { id: runId } = await ctx.params;

  // Auth + ownership check before opening the stream — errors here return JSON.
  let orgId: string;
  try {
    const session = await requireSession();
    orgId = session.org.id;
    const run = await db.query.runs.findFirst({
      where: and(eq(runs.id, runId), eq(runs.orgId, orgId)),
      columns: { id: true, status: true },
    });
    if (!run) throw new NotFoundError('Run not found', { runId }, traceId);
  } catch (e) {
    return apiError(e, { traceId, context: { runId } });
  }

  // Parse cursors from query string. Defaults: send everything since 0.
  const url = new URL(req.url);
  let lastMetricId = Number(url.searchParams.get('metricSince') ?? 0);
  let lastEventId = Number(url.searchParams.get('eventSince') ?? 0);
  const findingSince = url.searchParams.get('findingSince');
  let lastFindingTime: Date = findingSince ? new Date(findingSince) : new Date(0);

  if (!Number.isFinite(lastMetricId) || lastMetricId < 0) lastMetricId = 0;
  if (!Number.isFinite(lastEventId) || lastEventId < 0) lastEventId = 0;
  if (Number.isNaN(lastFindingTime.getTime())) lastFindingTime = new Date(0);

  log.info(
    { event: 'stream.opened', runId, lastMetricId, lastEventId, lastFindingTime },
    'opening SSE stream',
  );

  const encoder = new TextEncoder();
  let lastStatus: string | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (frame: string) => {
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          // Controller closed by client disconnect; loop will exit on next iter.
        }
      };

      // Initial heartbeat so the client knows the connection is open even if
      // the next poll yields no rows.
      send(sseFrame('heartbeat', { now: new Date().toISOString() }));

      const startedAt = Date.now();
      let lastHeartbeatAt = startedAt;
      let closeReason: 'terminal' | 'timeout' = 'timeout';

      try {
        while (Date.now() - startedAt < MAX_DURATION_MS) {
          // Fetch deltas in parallel.
          const [newMetrics, newEvents, newFindings, runRow] = await Promise.all([
            db.query.runMetrics.findMany({
              where: and(eq(runMetrics.runId, runId), gt(runMetrics.id, lastMetricId)),
              orderBy: (m, { asc }) => [asc(m.id)],
              limit: 200,
            }),
            db.query.runEvents.findMany({
              where: and(eq(runEvents.runId, runId), gt(runEvents.id, lastEventId)),
              orderBy: (e, { asc }) => [asc(e.id)],
              limit: 200,
            }),
            db.query.runFindings.findMany({
              where: and(
                eq(runFindings.runId, runId),
                gt(runFindings.createdAt, lastFindingTime),
              ),
              orderBy: (f, { asc }) => [asc(f.createdAt)],
              limit: 50,
            }),
            db.query.runs.findFirst({
              where: eq(runs.id, runId),
              columns: { status: true },
            }),
          ]);

          for (const m of newMetrics) {
            send(sseFrame('metric', m, String(m.id)));
            if (m.id > lastMetricId) lastMetricId = m.id;
          }
          for (const e of newEvents) {
            send(sseFrame('event', e, String(e.id)));
            if (e.id > lastEventId) lastEventId = e.id;
          }
          for (const f of newFindings) {
            send(sseFrame('finding', f));
            if (f.createdAt > lastFindingTime) lastFindingTime = f.createdAt;
          }

          if (runRow && runRow.status !== lastStatus) {
            send(sseFrame('status', { status: runRow.status }));
            lastStatus = runRow.status;
          }

          if (runRow && TERMINAL_STATUSES.has(runRow.status)) {
            closeReason = 'terminal';
            break;
          }

          // Periodic heartbeat to defeat any reverse-proxy idle timeout.
          if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
            send(sseFrame('heartbeat', { now: new Date().toISOString() }));
            lastHeartbeatAt = Date.now();
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }

        send(sseFrame('done', { reason: closeReason }));
        log.info(
          { event: 'stream.closed', runId, reason: closeReason, durationMs: Date.now() - startedAt },
          'SSE stream closed',
        );
      } catch (err) {
        log.error(
          { event: 'stream.error', err: (err as Error).message },
          'SSE stream errored',
        );
        send(sseFrame('done', { reason: 'timeout', error: (err as Error).message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Disable nginx-style buffering on intermediaries that respect this hint.
      'x-accel-buffering': 'no',
    },
  });
}
