/**
 * Run lifecycle state mutations the worker uses while processing.
 * Mirrors lib/runs.ts on the platform side.
 */
import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  runs,
  runEvents,
  runFindings,
  runMetrics,
  subscriptions,
  usageCredits,
  type RunFinding,
} from './db.js';
import { logger } from './logger.js';
import { notifyRunCompleted, notifyRunFailed } from './notify.js';
import { fireRunCompleted, fireRunFailed } from './outbound.js';

export async function appendEvent(
  runId: string,
  type: typeof runEvents.$inferInsert.type,
  message: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(runEvents).values({ runId, type, message, metadata });
}

export async function setProvisioning(runId: string) {
  await db
    .update(runs)
    .set({ status: 'provisioning', updatedAt: new Date() })
    .where(eq(runs.id, runId));
  await appendEvent(runId, 'provisioning_started', 'Provisioning sandbox.');
}

export async function setRunning(runId: string) {
  await db
    .update(runs)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(runs.id, runId));
  await appendEvent(runId, 'run_started', 'Bots executing.');
}

export async function setCompleted(opts: {
  runId: string;
  readinessScore: number;
  summary: Record<string, unknown>;
  costCentsActual: number;
}) {
  // Update run state first.
  const [updated] = await db
    .update(runs)
    .set({
      status: 'completed',
      completedAt: new Date(),
      readinessScore: opts.readinessScore,
      summaryJson: opts.summary,
      costCentsActual: opts.costCentsActual,
      updatedAt: new Date(),
    })
    .where(eq(runs.id, opts.runId))
    .returning({ orgId: runs.orgId, productKey: runs.productKey });

  await appendEvent(opts.runId, 'run_completed', 'Run completed.', {
    readinessScore: opts.readinessScore,
  });

  // Decrement a credit if appropriate. Subscription / free-tier paths
  // intentionally don't decrement; we just log how the run was billed.
  if (updated?.orgId && updated.productKey) {
    try {
      const result = await consumeCredit(updated.orgId, updated.productKey);
      logger.info(
        {
          event: 'run.credit_consumed',
          runId: opts.runId,
          orgId: updated.orgId,
          productKey: updated.productKey,
          consumed: result.consumed,
          reason: result.reason,
        },
        'credit consumption complete',
      );
    } catch (err) {
      // Don't fail the run on consumption errors; flag for ops review.
      logger.error(
        {
          event: 'run.consume_credit_failed',
          runId: opts.runId,
          orgId: updated.orgId,
          err: (err as Error).message,
        },
        'consumeCredit threw; run already completed',
      );
    }
  }

  // Fire-and-forget notification. notify* swallows its own errors.
  await notifyRunCompleted(opts.runId);
  // Outbound webhooks. fireRunCompleted swallows its own errors too.
  await fireRunCompleted(opts.runId);
}

/**
 * Atomically consume one credit for an org+productKey on run completion.
 * Mirrors platform/lib/entitlements.ts → consumeCredit.
 *
 *   - Subscription path: no decrement; subscription covers the run.
 *   - Free path: no decrement; free counter is computed from runs.
 *   - Credit path: single conditional UPDATE; only one of two concurrent
 *     callers wins (Postgres MVCC).
 */
export async function consumeCredit(
  orgId: string,
  productKey: string,
): Promise<{ consumed: boolean; reason: 'subscription' | 'free' | 'credit' | 'none' }> {
  const activeSub = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.orgId, orgId),
      sql`${subscriptions.status} in ('active', 'trialing')`,
    ),
  });
  if (activeSub) return { consumed: false, reason: 'subscription' };

  if (productKey === 'free') return { consumed: false, reason: 'free' };

  const updated = await db
    .update(usageCredits)
    .set({
      creditsRemaining: sql`${usageCredits.creditsRemaining} - 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(usageCredits.orgId, orgId),
        eq(usageCredits.productKey, productKey),
        sql`${usageCredits.creditsRemaining} > 0`,
      ),
    )
    .returning({ id: usageCredits.id });

  if (updated.length > 0) return { consumed: true, reason: 'credit' };
  return { consumed: false, reason: 'none' };
}

export async function setFailed(runId: string, errorSummary: string) {
  await db
    .update(runs)
    .set({ status: 'failed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(runs.id, runId));
  await appendEvent(runId, 'run_failed', errorSummary);
  await notifyRunFailed(runId, errorSummary);
  await fireRunFailed(runId, errorSummary);
}

export async function recordMetric(opts: {
  runId: string;
  tSeconds: number;
  activeBots?: number;
  rps?: number;
  p50Ms?: number;
  p95Ms?: number;
  p99Ms?: number;
  errorRate?: number;
  extras?: Record<string, number>;
}) {
  await db.insert(runMetrics).values(opts);
}

export async function recordFinding(opts: Omit<RunFinding, 'id' | 'createdAt'>) {
  await db.insert(runFindings).values(opts);
}

export async function getRun(runId: string) {
  return db.query.runs.findFirst({ where: eq(runs.id, runId) });
}
