/**
 * Oracle Bot worker — long-running BullMQ consumer.
 *
 * Deploy target: Railway service. Build: `npm run build`. Start: `npm start`.
 *
 * Concurrency:
 *   - Run-execution workers process N runs in parallel (default 4)
 *   - Email workers process N in parallel (default 16, network-bound)
 *   - Billing reconciliation: 2 in parallel (DB-heavy, infrequent)
 *
 * Resilience (Phase 2):
 *   - ioredis retries forever on transient failures
 *   - Jobs that exhaust attempts are persisted to `dead_jobs` (Postgres)
 *   - SIGTERM drains in-flight jobs up to SHUTDOWN_DRAIN_MS, then exits
 *   - HTTP health server exposes /healthz + /readyz for the orchestrator
 */
// IMPORTANT: env.js MUST be the first import — it loads dotenv and validates
// process.env. Sentry must come second so its init sees the validated DSN
// before any other module loads (and any errors during boot get reported).
import { env } from './env.js';
import './sentry.js';
import * as Sentry from '@sentry/node';
import { Worker, type Job } from 'bullmq';
import { QUEUES, JOB_NAMES, getConnection } from './queue-config.js';
import { processExecuteRun } from './processors/run.js';
import { processSendEmail } from './processors/email.js';
import { logger, newTraceId, withTrace } from './logger.js';
import { startHealthServer } from './health.js';
import { db, deadJobs } from './db.js';
import { registerWebClassicsProbes } from './engine/probes/web-classics.js';
import { registerAiBuiltAppsProbes } from './engine/probes/ai-built-apps.js';

// ── Probe registry boot ─────────────────────────────────────────────────────
// Every pack registers its probes here at startup so the registry is populated
// before any run picks one up. Idempotent — safe to call multiple times.
registerWebClassicsProbes();
registerAiBuiltAppsProbes();

logger.info({ event: 'worker.starting' }, 'worker starting');

// ── Health probe HTTP server ────────────────────────────────────────────────
// Railway injects PORT and probes /readyz on it. Locally PORT is unset and
// we fall back to PORT_HEALTH (default 8080).
const healthPort = env.PORT ?? env.PORT_HEALTH;
const healthServer = startHealthServer({ port: healthPort });

// ── BullMQ workers ──────────────────────────────────────────────────────────
const runWorker = new Worker(
  QUEUES.RUN_EXECUTION,
  async (job) => {
    const traceId = newTraceId();
    const log = withTrace(traceId).child({ queue: 'run', jobId: job.id, jobName: job.name });
    if (job.name === JOB_NAMES.EXECUTE_RUN) return processExecuteRun(job as never, log);
    if (job.name === JOB_NAMES.CANCEL_RUN) {
      log.info({ event: 'cancel.acknowledged', runId: job.data.runId }, 'cancel acknowledged');
      return;
    }
    log.warn({ event: 'run.unknown_job_name' }, 'unknown job name');
  },
  { connection: getConnection(), concurrency: env.WORKER_RUN_CONCURRENCY },
);

const emailWorker = new Worker(QUEUES.EMAIL, processSendEmail as never, {
  connection: getConnection(),
  concurrency: env.WORKER_EMAIL_CONCURRENCY,
});

const billingWorker = new Worker(
  QUEUES.BILLING_RECONCILIATION,
  async (job) => {
    const log = withTrace(newTraceId()).child({ queue: 'billing', jobId: job.id });
    log.info({ event: 'billing.reconcile_stub', data: job.data }, 'billing reconcile stub');
  },
  { connection: getConnection(), concurrency: 2 },
);

// ── Lifecycle wiring ────────────────────────────────────────────────────────
const workers: Array<readonly [string, Worker]> = [
  ['run', runWorker],
  ['email', emailWorker],
  ['billing', billingWorker],
];

for (const [name, worker] of workers) {
  worker.on('completed', (job) => {
    logger.info(
      { event: 'job.completed', queue: name, jobId: job.id, jobName: job.name },
      'job completed',
    );
  });
  worker.on('failed', async (job, err) => {
    if (!job) {
      logger.error({ event: 'job.failed_no_job', queue: name, err: err?.message }, 'failure with no job');
      return;
    }

    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    logger.error(
      {
        event: exhausted ? 'job.dead_lettered' : 'job.failed',
        queue: name,
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        attemptsAllowed: job.opts.attempts ?? 1,
        err: { name: err?.name, message: err?.message, stack: err?.stack },
      },
      exhausted ? 'job dead-lettered' : 'job failed (will retry)',
    );
    Sentry.captureException(err, { tags: { queue: name, jobName: job.name }, extra: { jobId: job.id } });

    // Permanent failure → persist to Postgres so it survives Redis wipes.
    if (exhausted) {
      try {
        await persistDeadJob(name, job, err);
      } catch (persistErr) {
        // Don't fail-loop the worker on DLQ persistence errors. Just log.
        logger.error(
          { event: 'dead_letter.persist_failed', err: (persistErr as Error).message },
          'failed to persist dead job',
        );
        Sentry.captureException(persistErr);
      }
    }
  });
  worker.on('error', (err) => {
    logger.error({ event: 'worker.error', queue: name, err: err.message }, 'worker error');
    Sentry.captureException(err, { tags: { queue: name } });
  });
}

async function persistDeadJob(queue: string, job: Job, err?: Error): Promise<void> {
  await db.insert(deadJobs).values({
    queue,
    jobName: job.name,
    jobId: String(job.id ?? 'unknown'),
    payload: job.data as Record<string, unknown>,
    failedReason: err?.message ?? job.failedReason ?? null,
    stack: err?.stack ?? null,
    attemptsMade: job.attemptsMade,
  });
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: 'worker.shutdown', signal }, 'received signal, shutting down');

  // Stop accepting new health requests immediately.
  healthServer.close();

  // Race: BullMQ's worker.close() awaits in-flight jobs. We bound the wait so
  // a hung job can't keep the container alive past Railway's grace period.
  const drainTimeout = new Promise<void>((resolve) =>
    setTimeout(() => {
      logger.warn(
        { event: 'shutdown.drain_timeout', timeoutMs: env.SHUTDOWN_DRAIN_MS },
        'drain timed out, force-closing',
      );
      resolve();
    }, env.SHUTDOWN_DRAIN_MS),
  );
  const drainAll = Promise.allSettled(workers.map(([, w]) => w.close()));
  await Promise.race([drainAll, drainTimeout]);

  await Sentry.flush(2_000).catch(() => undefined);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ event: 'process.unhandled_rejection', reason }, 'unhandled rejection');
  Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  logger.fatal(
    { event: 'process.uncaught_exception', err: { name: err.name, message: err.message, stack: err.stack } },
    'uncaught exception',
  );
  Sentry.captureException(err);
});

logger.info(
  {
    event: 'worker.up',
    runConcurrency: env.WORKER_RUN_CONCURRENCY,
    emailConcurrency: env.WORKER_EMAIL_CONCURRENCY,
    billingConcurrency: 2,
    healthPort,
  },
  'worker up',
);
