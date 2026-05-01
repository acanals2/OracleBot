/**
 * Run lifecycle CRUD + state transitions.
 *
 * All mutations go through these functions so the state machine stays valid:
 *
 *   queued → provisioning → running → completed
 *                        ↘ failed
 *                        ↘ canceled
 *                        ↘ timed_out
 *
 * The web app calls `createRun` + `enqueueExecuteRun`, then everything else
 * is the worker's job (see worker/src/processors/run.ts).
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import {
  runEvents,
  runFindings,
  runMetrics,
  runs,
  shareLinks,
  type NewRun,
  type Run,
  type RunFinding,
} from './db/schema';
import { z } from 'zod';
import crypto from 'node:crypto';

// ────────────────────────────────────────────────────────────────────────────
// Validation schemas — matched against POST /api/runs body
// ────────────────────────────────────────────────────────────────────────────

export const createRunInputSchema = z
  .object({
    mode: z.enum(['site', 'agent', 'api', 'stack']),
    name: z.string().trim().min(1).max(120),
    productKey: z.enum(['scout', 'builder', 'studio', 'stack']),
    botCount: z.number().int().min(1).max(30_000),
    durationMinutes: z.number().int().min(1).max(180),
    target: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('repo'),
        repoUrl: z.string().url(),
        commitSha: z.string().optional(),
      }),
      z.object({
        kind: z.literal('docker'),
        image: z.string().min(1),
      }),
      z.object({
        kind: z.literal('liveUrl'),
        url: z.string().url(),
      }),
      z.object({
        kind: z.literal('agent'),
        endpoint: z.string().url(),
      }),
    ]),
    intentMix: z
      .object({
        friendly: z.number().min(0).max(1).optional(),
        adversarial: z.number().min(0).max(1).optional(),
        confused: z.number().min(0).max(1).optional(),
        hostile: z.number().min(0).max(1).optional(),
      })
      .optional(),
    personaMix: z
      .array(z.object({ archetype: z.string(), weight: z.number().min(0).max(1) }))
      .optional(),
    scenarioIds: z.array(z.string()).optional(),
    hardCapCents: z.number().int().min(100).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .refine(
    (v) => {
      // Stack mode requires a target that has actual code (repo or docker).
      if (v.mode === 'stack' && (v.target.kind === 'liveUrl' || v.target.kind === 'agent')) {
        return false;
      }
      return true;
    },
    { message: 'Stack mode requires a repo or docker target.' },
  );

export type CreateRunInput = z.infer<typeof createRunInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Read helpers
// ────────────────────────────────────────────────────────────────────────────

export async function listRunsForOrg(orgId: string, limit = 50) {
  return db
    .select()
    .from(runs)
    .where(eq(runs.orgId, orgId))
    .orderBy(desc(runs.createdAt))
    .limit(limit);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getRunForOrg(orgId: string, runId: string): Promise<Run | null> {
  if (!UUID_RE.test(runId)) return null;
  const row = await db.query.runs.findFirst({
    where: and(eq(runs.id, runId), eq(runs.orgId, orgId)),
  });
  return row ?? null;
}

export async function getRunWithDetails(orgId: string, runId: string) {
  const run = await getRunForOrg(orgId, runId);
  if (!run) return null;
  const [findings, recentEvents, metrics] = await Promise.all([
    db.query.runFindings.findMany({
      where: eq(runFindings.runId, runId),
      orderBy: (f, { asc }) => [asc(f.severity), asc(f.createdAt)],
    }),
    db.query.runEvents.findMany({
      where: eq(runEvents.runId, runId),
      orderBy: (e, { desc }) => [desc(e.createdAt)],
      limit: 100,
    }),
    db.query.runMetrics.findMany({
      where: eq(runMetrics.runId, runId),
      orderBy: (m, { asc }) => [asc(m.tSeconds)],
    }),
  ]);
  return { run, findings, events: recentEvents, metrics };
}

// ────────────────────────────────────────────────────────────────────────────
// Write helpers
// ────────────────────────────────────────────────────────────────────────────

export async function createRun(opts: {
  orgId: string;
  userId: string;
  input: CreateRunInput;
  costCentsEstimated: number;
}): Promise<Run> {
  const target = opts.input.target;
  const newRun: NewRun = {
    orgId: opts.orgId,
    createdByUserId: opts.userId,
    mode: opts.input.mode,
    name: opts.input.name,
    botCount: opts.input.botCount,
    durationMinutes: opts.input.durationMinutes,
    intentMix: opts.input.intentMix,
    personaMix: opts.input.personaMix,
    scenarioIds: opts.input.scenarioIds,
    hardCapCents: opts.input.hardCapCents,
    costCentsEstimated: opts.costCentsEstimated,
    idempotencyKey: opts.input.idempotencyKey,
    status: 'queued',
    targetRepoUrl: target.kind === 'repo' ? target.repoUrl : null,
    targetCommitSha: target.kind === 'repo' ? (target.commitSha ?? null) : null,
    targetDockerImage: target.kind === 'docker' ? target.image : null,
    targetLiveUrl: target.kind === 'liveUrl' ? target.url : null,
    targetAgentEndpoint: target.kind === 'agent' ? target.endpoint : null,
  };

  const [created] = await db.insert(runs).values(newRun).returning();
  await appendRunEvent(created.id, 'queued', 'Run accepted and queued for execution.');
  return created;
}

// ────────────────────────────────────────────────────────────────────────────
// State transitions — only the worker should call these.
// They're co-located here so the state machine is one file.
// ────────────────────────────────────────────────────────────────────────────

export async function markRunProvisioning(runId: string) {
  await db
    .update(runs)
    .set({ status: 'provisioning', updatedAt: new Date() })
    .where(eq(runs.id, runId));
  await appendRunEvent(runId, 'provisioning_started', 'Provisioning sandbox.');
}

export async function markRunRunning(runId: string) {
  await db
    .update(runs)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(runs.id, runId));
  await appendRunEvent(runId, 'run_started', 'Bots started executing.');
}

export async function markRunCompleted(opts: {
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
  await appendRunEvent(opts.runId, 'run_completed', 'Run completed.', {
    readinessScore: opts.readinessScore,
  });
}

export async function markRunFailed(runId: string, errorSummary: string) {
  await db
    .update(runs)
    .set({ status: 'failed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(runs.id, runId));
  await appendRunEvent(runId, 'run_failed', errorSummary);
}

export async function markRunCanceled(runId: string, reason?: string) {
  await db
    .update(runs)
    .set({ status: 'canceled', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(runs.id, runId));
  await appendRunEvent(runId, 'run_canceled', reason ?? 'Canceled by user.');
}

export async function appendRunEvent(
  runId: string,
  type: typeof runEvents.$inferInsert.type,
  message: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(runEvents).values({ runId, type, message, metadata });
}

export async function recordRunMetric(opts: {
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

export async function recordRunFinding(opts: Omit<RunFinding, 'id' | 'createdAt'>) {
  await db.insert(runFindings).values(opts);
}

// ────────────────────────────────────────────────────────────────────────────
// Share links
// ────────────────────────────────────────────────────────────────────────────

export async function createShareLink(opts: {
  runId: string;
  createdByUserId: string;
  expiresInDays?: number;
}): Promise<{ token: string }> {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = opts.expiresInDays
    ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  await db.insert(shareLinks).values({
    runId: opts.runId,
    createdByUserId: opts.createdByUserId,
    token,
    expiresAt,
  });
  return { token };
}

export async function getRunByShareToken(token: string) {
  const link = await db.query.shareLinks.findFirst({
    where: eq(shareLinks.token, token),
  });
  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt < new Date()) return null;
  const run = await db.query.runs.findFirst({ where: eq(runs.id, link.runId) });
  return run ?? null;
}

/**
 * Spectator-mode hydration: full run details (events + findings + metrics)
 * resolved by share token instead of org ownership. Returns null if the
 * token is invalid, revoked, or expired.
 *
 * Used by /share/[token]/{live,results}/page.tsx for the public read-only
 * view.
 */
export async function getRunWithDetailsByShareToken(token: string) {
  const run = await getRunByShareToken(token);
  if (!run) return null;
  const [findings, recentEvents, metrics] = await Promise.all([
    db.query.runFindings.findMany({
      where: eq(runFindings.runId, run.id),
      orderBy: (f, { asc }) => [asc(f.severity), asc(f.createdAt)],
    }),
    db.query.runEvents.findMany({
      where: eq(runEvents.runId, run.id),
      orderBy: (e, { desc }) => [desc(e.createdAt)],
      limit: 100,
    }),
    db.query.runMetrics.findMany({
      where: eq(runMetrics.runId, run.id),
      orderBy: (m, { asc }) => [asc(m.tSeconds)],
    }),
  ]);
  return { run, findings, events: recentEvents, metrics };
}
