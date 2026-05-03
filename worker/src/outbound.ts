/**
 * Outbound webhook delivery — Phase 18b.
 *
 * On run completion / failure we POST a JSON payload to every enabled
 * `outbound_webhooks` row for the run's org whose `events` array contains
 * the matching event type. Each request carries an HMAC-SHA256 signature
 * computed over the raw body using the webhook's stored secret, sent as
 * `X-OracleBot-Signature: sha256=<hex>`.
 *
 * Errors are NEVER fatal — we log to outbound_webhooks.last_error and
 * move on. A retry queue + delivery log table are deferred until customer
 * demand. For now: a failed webhook surfaces in the Settings UI on the
 * row's error field, and operators can recreate or fix the URL.
 *
 * Timeouts: 5s per request. Anything longer is treated as a failure.
 * Slack/Linear/internal endpoints respond in <500ms; 5s gives margin
 * without blocking the run-completion code path.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, outboundWebhooks, runs } from './db.js';
import { logger } from './logger.js';

const TIMEOUT_MS = 5_000;
const SIG_HEADER = 'X-OracleBot-Signature';

export interface RunCompletedPayload {
  event: 'run.completed';
  runId: string;
  orgId: string;
  status: 'completed';
  readinessScore: number | null;
  findingsCount: number;
  mode: string;
  name: string;
  reportUrl: string;
  occurredAt: string;
}
export interface RunFailedPayload {
  event: 'run.failed';
  runId: string;
  orgId: string;
  status: 'failed';
  error: string;
  mode: string;
  name: string;
  reportUrl: string;
  occurredAt: string;
}
export type OutboundPayload = RunCompletedPayload | RunFailedPayload;

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Caller-facing helper. Verifies an inbound signature in constant time.
 * Exported for tests; the actual verifier lives on the customer side.
 */
export function verifyOutboundSignature(secret: string, body: string, header: string | null): boolean {
  if (!header) return false;
  const expected = sign(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'https://oraclebot.net';
}

async function deliverOne(webhookId: string, url: string, secret: string, payload: OutboundPayload): Promise<void> {
  const body = JSON.stringify(payload);
  const sig = sign(secret, body);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SIG_HEADER]: sig,
        'User-Agent': 'OracleBot-Webhook/1',
        'X-OracleBot-Event': payload.event,
        'X-OracleBot-Delivery': webhookId + ':' + payload.runId,
      },
      body,
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      await db
        .update(outboundWebhooks)
        .set({ lastDeliveredAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(outboundWebhooks.id, webhookId));
      logger.info(
        { event: 'outbound.delivered', webhookId, runId: payload.runId, status: res.status },
        'outbound webhook delivered',
      );
    } else {
      const errMsg = `HTTP ${res.status}`;
      await db
        .update(outboundWebhooks)
        .set({ lastError: errMsg, updatedAt: new Date() })
        .where(eq(outboundWebhooks.id, webhookId));
      logger.warn(
        { event: 'outbound.bad_status', webhookId, runId: payload.runId, status: res.status },
        'outbound webhook returned non-2xx',
      );
    }
  } catch (err) {
    clearTimeout(timer);
    const errMsg = (err as Error).message || 'unknown';
    await db
      .update(outboundWebhooks)
      .set({ lastError: errMsg.slice(0, 500), updatedAt: new Date() })
      .where(eq(outboundWebhooks.id, webhookId))
      .catch(() => null);
    logger.warn(
      { event: 'outbound.delivery_failed', webhookId, runId: payload.runId, err: errMsg },
      'outbound webhook delivery failed',
    );
  }
}

export async function fireRunCompleted(runId: string): Promise<void> {
  try {
    const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!run) return;

    // Find the count via a tiny existing helper-free query — the worker
    // already loads findings via run state, but we keep this independent so
    // a fresh worker process can deliver without a cache.
    const [{ count }] = (await db
      .select({ count: sqlCount() })
      .from((await import('./db.js')).runFindings)
      .where(eq((await import('./db.js')).runFindings.runId, runId))) as unknown as { count: number }[];

    const subs = await db
      .select()
      .from(outboundWebhooks)
      .where(and(eq(outboundWebhooks.orgId, run.orgId), eq(outboundWebhooks.enabled, true)));
    if (subs.length === 0) return;

    const payload: RunCompletedPayload = {
      event: 'run.completed',
      runId,
      orgId: run.orgId,
      status: 'completed',
      readinessScore: run.readinessScore,
      findingsCount: Number(count) || 0,
      mode: run.mode,
      name: run.name,
      reportUrl: `${appBaseUrl()}/app/tests/${runId}/results`,
      occurredAt: new Date().toISOString(),
    };

    await Promise.all(
      subs
        .filter((s) => Array.isArray(s.events) && s.events.includes('run.completed'))
        .map((s) => deliverOne(s.id, s.url, s.secret, payload)),
    );
  } catch (err) {
    logger.warn(
      { event: 'outbound.fire_completed_failed', runId, err: (err as Error).message },
      'fireRunCompleted threw',
    );
  }
}

export async function fireRunFailed(runId: string, errorSummary: string): Promise<void> {
  try {
    const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!run) return;
    const subs = await db
      .select()
      .from(outboundWebhooks)
      .where(and(eq(outboundWebhooks.orgId, run.orgId), eq(outboundWebhooks.enabled, true)));
    if (subs.length === 0) return;

    const payload: RunFailedPayload = {
      event: 'run.failed',
      runId,
      orgId: run.orgId,
      status: 'failed',
      error: errorSummary,
      mode: run.mode,
      name: run.name,
      reportUrl: `${appBaseUrl()}/app/tests/${runId}/results`,
      occurredAt: new Date().toISOString(),
    };

    await Promise.all(
      subs
        .filter((s) => Array.isArray(s.events) && s.events.includes('run.failed'))
        .map((s) => deliverOne(s.id, s.url, s.secret, payload)),
    );
  } catch (err) {
    logger.warn(
      { event: 'outbound.fire_failed_failed', runId, err: (err as Error).message },
      'fireRunFailed threw',
    );
  }
}

// Tiny helper — drizzle-orm doesn't export a count() helper that
// composes with select() without an as. Inline raw count.
function sqlCount() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { sql } = require('drizzle-orm');
  return sql<number>`count(*)::int`;
}
