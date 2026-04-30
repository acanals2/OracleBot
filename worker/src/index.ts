/**
 * Oracle Bot worker — long-running BullMQ consumer.
 *
 * Deploy target: Railway service. Build: `npm run build`. Start: `npm start`.
 *
 * Concurrency:
 *   - Run-execution workers process 4 runs in parallel by default
 *   - Email workers process 16 in parallel (network-bound, fast)
 *   - Billing reconciliation: 2 in parallel (DB-heavy, infrequent)
 */
// IMPORTANT: env.js MUST be the first import — it loads dotenv and validates
// process.env. Sentry must come second so its init sees the validated DSN
// before any other module loads (and any errors during boot get reported).
import { env } from './env.js';
import './sentry.js';
import * as Sentry from '@sentry/node';
import { Worker } from 'bullmq';
import { QUEUES, JOB_NAMES, getConnection } from './queue-config.js';
import { processExecuteRun } from './processors/run.js';
import { processSendEmail } from './processors/email.js';
import { logger, newTraceId, withTrace } from './logger.js';

logger.info({ event: 'worker.starting' }, 'worker starting');

const runWorker = new Worker(
  QUEUES.RUN_EXECUTION,
  async (job) => {
    const traceId = newTraceId();
    const log = withTrace(traceId).child({ queue: 'run', jobId: job.id, jobName: job.name });
    if (job.name === JOB_NAMES.EXECUTE_RUN) return processExecuteRun(job as never, log);
    if (job.name === JOB_NAMES.CANCEL_RUN) {
      // Real engine: tear down sandbox here. For now, status is already set
      // in the API route (markRunCanceled). The processor just acknowledges.
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

for (const [name, worker] of [
  ['run', runWorker],
  ['email', emailWorker],
  ['billing', billingWorker],
] as const) {
  worker.on('completed', (job) => {
    logger.info({ event: 'job.completed', queue: name, jobId: job.id, jobName: job.name }, 'job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error(
      { event: 'job.failed', queue: name, jobId: job?.id, jobName: job?.name, err: { name: err?.name, message: err?.message, stack: err?.stack } },
      'job failed',
    );
    Sentry.captureException(err, { tags: { queue: name, jobName: job?.name }, extra: { jobId: job?.id } });
  });
}

const shutdown = async (signal: string) => {
  logger.info({ event: 'worker.shutdown', signal }, 'received signal, shutting down');
  await Promise.allSettled([runWorker.close(), emailWorker.close(), billingWorker.close()]);
  await Sentry.flush(2000).catch(() => undefined);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ event: 'process.unhandled_rejection', reason }, 'unhandled rejection');
  Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ event: 'process.uncaught_exception', err: { name: err.name, message: err.message, stack: err.stack } }, 'uncaught exception');
  Sentry.captureException(err);
});

logger.info(
  {
    event: 'worker.up',
    runConcurrency: env.WORKER_RUN_CONCURRENCY,
    emailConcurrency: env.WORKER_EMAIL_CONCURRENCY,
    billingConcurrency: 2,
  },
  'worker up',
);
