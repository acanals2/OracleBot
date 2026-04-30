/**
 * Run lifecycle state mutations the worker uses while processing.
 * Mirrors lib/runs.ts on the platform side.
 */
import { eq } from 'drizzle-orm';
import { db, runs, runEvents, runFindings, runMetrics, type RunFinding } from './db.js';

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
  await db
    .update(runs)
    .set({
      status: 'completed',
      completedAt: new Date(),
      readinessScore: opts.readinessScore,
      summaryJson: opts.summary,
      costCentsActual: opts.costCentsActual,
      updatedAt: new Date(),
    })
    .where(eq(runs.id, opts.runId));
  await appendEvent(opts.runId, 'run_completed', 'Run completed.', {
    readinessScore: opts.readinessScore,
  });
}

export async function setFailed(runId: string, errorSummary: string) {
  await db
    .update(runs)
    .set({ status: 'failed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(runs.id, runId));
  await appendEvent(runId, 'run_failed', errorSummary);
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
