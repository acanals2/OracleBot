/**
 * Run-execution processor.
 *
 * Drives a full test run from queued → provisioning → running → completed:
 *
 *   1. provisionSandbox — spins up an E2B microVM (repo/docker) or returns a
 *      live URL handle directly (liveUrl/agentEndpoint targets).
 *   2. selectEngine(mode) — picks site-bot, agent-bot, api-bot, or stack-bot.
 *   3. Streams EngineEvents: BotTick → recordMetric, RawFinding → recordFinding.
 *   4. computeReadinessScore(findings) — 0–100 based on finding severity weights.
 *   5. setCompleted — persists score, summary, and actual cost.
 */
import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import {
  setProvisioning,
  setRunning,
  setCompleted,
  setFailed,
  recordMetric,
  recordFinding,
  appendEvent,
  getRun,
} from '../run-state.js';
import type { ExecuteRunJobData } from '../queue-config.js';
import {
  provisionSandbox,
  selectEngine,
  computeReadinessScore,
  isBotTick,
} from '../engine/index.js';
import type { RawFinding } from '../engine/index.js';
import { env } from '../env.js';
import { logger as rootLogger } from '../logger.js';

export async function processExecuteRun(job: Job<ExecuteRunJobData>, parentLog?: Logger) {
  const { runId } = job.data;
  const log = (parentLog ?? rootLogger).child({ runId });
  log.info({ event: 'run.picked_up' }, 'run picked up');

  const run = await getRun(runId);
  if (!run) {
    log.warn({ event: 'run.not_found' }, 'run not found in DB — abandoning job');
    return;
  }

  // Skip if already terminal (idempotent retry safety)
  if (
    run.status === 'completed' ||
    run.status === 'failed' ||
    run.status === 'canceled'
  ) {
    log.info({ event: 'run.already_terminal', status: run.status }, 'run already terminal — skip');
    return;
  }

  const anthropicApiKey = env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    await setFailed(runId, 'ANTHROPIC_API_KEY is not set in worker environment');
    return;
  }

  try {
    // ── Provisioning ──────────────────────────────────────────────────────
    await setProvisioning(runId);

    const sandbox = await provisionSandbox(run);
    await appendEvent(runId, 'provisioning_completed', `Sandbox ready at ${sandbox.targetUrl}`);

    // ── Running ───────────────────────────────────────────────────────────
    await setRunning(runId);

    const engine = selectEngine(run.mode);
    const durationMs = run.durationMinutes * 60 * 1000;
    const startMs = Date.now();
    const findings: RawFinding[] = [];

    try {
      for await (const event of engine({
        run,
        targetUrl: sandbox.targetUrl,
        durationMs,
        anthropicApiKey,
      })) {
        if (isBotTick(event)) {
          await recordMetric({ runId, ...event });
          const elapsed = Date.now() - startMs;
          await job.updateProgress(Math.min(99, Math.round((elapsed / durationMs) * 100)));
        } else {
          findings.push(event);
          await recordFinding({
            runId,
            ...event,
            // Normalize optional fields: DB schema requires null, not undefined
            reproJson: event.reproJson ?? null,
            remediation: event.remediation ?? null,
            fixPullRequestUrl: event.fixPullRequestUrl ?? null,
            // Phase 10b: engines tag emissions with probe IDs from the
            // web_classics registry. Older callers may still emit without
            // one — fall through as null so the schema constraint is met.
            probeId: event.probeId ?? null,
          });
          await appendEvent(runId, 'finding_surfaced', event.title, {
            severity: event.severity,
            category: event.category,
          });
          log.info(
            { event: 'run.finding_surfaced', severity: event.severity, category: event.category, title: event.title },
            'finding surfaced',
          );
        }
      }
    } finally {
      // Always tear down sandbox even if engine throws
      await sandbox.stop().catch((e: Error) => {
        log.warn({ event: 'run.sandbox_stop_error', err: e.message }, 'sandbox stop error');
      });
    }

    // ── Completion ───────────────────────────────────────────────────────
    const readinessScore = computeReadinessScore(findings);
    const costCentsActual = Math.round((Date.now() - startMs) / 1000 / 60 * (run.costCentsEstimated ?? 0) / run.durationMinutes);

    await setCompleted({
      runId,
      readinessScore,
      summary: {
        mode: run.mode,
        findingCount: findings.length,
        findingsBySeverity: {
          critical: findings.filter((f) => f.severity === 'critical').length,
          high: findings.filter((f) => f.severity === 'high').length,
          medium: findings.filter((f) => f.severity === 'medium').length,
          low: findings.filter((f) => f.severity === 'low').length,
          info: findings.filter((f) => f.severity === 'info').length,
        },
        targetUrl: sandbox.targetUrl,
      },
      costCentsActual,
    });

    log.info(
      {
        event: 'run.completed',
        readinessScore,
        findingCount: findings.length,
        costCentsActual,
      },
      'run completed',
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error({ event: 'run.failed', err: msg }, 'run failed');
    await setFailed(runId, msg);
    throw e; // let BullMQ record the failure for retry
  }
}
