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

export async function processExecuteRun(job: Job<ExecuteRunJobData>) {
  const { runId } = job.data;
  console.log(`[run ${runId}] picked up by worker`);

  const run = await getRun(runId);
  if (!run) {
    console.warn(`[run ${runId}] not found in DB — abandoning job`);
    return;
  }

  // Skip if already terminal (idempotent retry safety)
  if (
    run.status === 'completed' ||
    run.status === 'failed' ||
    run.status === 'canceled'
  ) {
    console.log(`[run ${runId}] already terminal (${run.status}) — skip`);
    return;
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
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
          });
          await appendEvent(runId, 'finding_surfaced', event.title, {
            severity: event.severity,
            category: event.category,
          });
          console.log(`[run ${runId}] finding: [${event.severity}] ${event.title}`);
        }
      }
    } finally {
      // Always tear down sandbox even if engine throws
      await sandbox.stop().catch((e: Error) => {
        console.warn(`[run ${runId}] sandbox stop error:`, e.message);
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

    console.log(
      `[run ${runId}] completed — score: ${readinessScore}, findings: ${findings.length}, cost: $${(costCentsActual / 100).toFixed(2)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[run ${runId}] failed:`, msg);
    await setFailed(runId, msg);
    throw e; // let BullMQ record the failure for retry
  }
}
