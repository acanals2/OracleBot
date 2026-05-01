/**
 * Shared SSE polling loop for run telemetry.
 *
 * The authenticated stream (`/api/runs/[id]/stream`) and the public
 * spectator stream (`/api/share/[token]/stream`) emit the same message
 * shapes against the same database. Only the auth check differs. This
 * helper centralizes the polling, framing, and lifecycle so the two
 * routes stay byte-for-byte equivalent on the wire.
 *
 * Usage:
 *
 *   const { stream, headers } = openRunStream({
 *     runId,
 *     cursors: parseCursors(req),
 *     traceId,
 *     log,
 *   });
 *   return new Response(stream, { headers });
 */
import { eq, and, gt } from 'drizzle-orm';
import type { Logger } from 'pino';
import { db } from './db';
import { runs, runEvents, runFindings, runMetrics } from './db/schema';

export const STREAM_MAX_DURATION_MS = 9_000;
export const STREAM_POLL_INTERVAL_MS = 1_000;
export const STREAM_HEARTBEAT_INTERVAL_MS = 5_000;

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled', 'timed_out']);

export const SSE_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  // Disable nginx-style buffering on intermediaries that respect this hint.
  'x-accel-buffering': 'no',
};

export interface StreamCursors {
  lastMetricId: number;
  lastEventId: number;
  lastFindingTime: Date;
}

export function parseCursors(req: Request): StreamCursors {
  const url = new URL(req.url);
  let lastMetricId = Number(url.searchParams.get('metricSince') ?? 0);
  let lastEventId = Number(url.searchParams.get('eventSince') ?? 0);
  const findingSince = url.searchParams.get('findingSince');
  let lastFindingTime: Date = findingSince ? new Date(findingSince) : new Date(0);

  if (!Number.isFinite(lastMetricId) || lastMetricId < 0) lastMetricId = 0;
  if (!Number.isFinite(lastEventId) || lastEventId < 0) lastEventId = 0;
  if (Number.isNaN(lastFindingTime.getTime())) lastFindingTime = new Date(0);

  return { lastMetricId, lastEventId, lastFindingTime };
}

function sseFrame(eventName: string, data: unknown, id?: string): string {
  let frame = `event: ${eventName}\n`;
  if (id) frame += `id: ${id}\n`;
  frame += `data: ${JSON.stringify(data)}\n\n`;
  return frame;
}

export interface OpenRunStreamOpts {
  runId: string;
  cursors: StreamCursors;
  traceId: string;
  log: Logger;
}

export function openRunStream({ runId, cursors, traceId, log }: OpenRunStreamOpts): {
  stream: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
} {
  const encoder = new TextEncoder();
  let { lastMetricId, lastEventId, lastFindingTime } = cursors;
  let lastStatus: string | null = null;

  log.info(
    {
      event: 'stream.opened',
      runId,
      traceId,
      lastMetricId,
      lastEventId,
      lastFindingTime,
    },
    'opening SSE stream',
  );

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: string) => {
        try {
          controller.enqueue(encoder.encode(frame));
        } catch {
          // Controller closed by client disconnect; loop exits next iter.
        }
      };

      send(sseFrame('heartbeat', { now: new Date().toISOString() }));

      const startedAt = Date.now();
      let lastHeartbeatAt = startedAt;
      let closeReason: 'terminal' | 'timeout' = 'timeout';

      try {
        while (Date.now() - startedAt < STREAM_MAX_DURATION_MS) {
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

          if (Date.now() - lastHeartbeatAt >= STREAM_HEARTBEAT_INTERVAL_MS) {
            send(sseFrame('heartbeat', { now: new Date().toISOString() }));
            lastHeartbeatAt = Date.now();
          }

          await new Promise((r) => setTimeout(r, STREAM_POLL_INTERVAL_MS));
        }

        send(sseFrame('done', { reason: closeReason }));
        log.info(
          {
            event: 'stream.closed',
            runId,
            traceId,
            reason: closeReason,
            durationMs: Date.now() - startedAt,
          },
          'SSE stream closed',
        );
      } catch (err) {
        log.error(
          { event: 'stream.error', traceId, err: (err as Error).message },
          'SSE stream errored',
        );
        send(sseFrame('done', { reason: 'timeout', error: (err as Error).message }));
      } finally {
        controller.close();
      }
    },
  });

  return { stream, headers: SSE_HEADERS };
}
