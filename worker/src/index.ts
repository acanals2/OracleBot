/**
 * Oracle Bot worker — long-running BullMQ consumer.
 *
 * Deploy target: Railway service. Build: `npm run build`. Start: `npm start`.
 *
 * Env required:
 *   DATABASE_URL          — Neon Postgres connection
 *   REDIS_URL             — Railway Redis (private URL)
 *   RESEND_API_KEY        — Resend API key (email sends)
 *   ANTHROPIC_API_KEY     — Claude API (AI fix loop, later)
 *   E2B_API_KEY           — Sandbox provisioner (later)
 *   INTERNAL_API_SECRET   — shared with platform for cron callbacks
 *
 * Concurrency:
 *   - Run-execution workers process 4 runs in parallel by default
 *   - Email workers process 16 in parallel (network-bound, fast)
 *   - Billing reconciliation: 2 in parallel (DB-heavy, infrequent)
 */
import './env.js';
import { Worker } from 'bullmq';
import { QUEUES, JOB_NAMES, getConnection } from './queue-config.js';
import { processExecuteRun } from './processors/run.js';
import { processSendEmail } from './processors/email.js';

console.log('[worker] starting…');

const RUN_CONCURRENCY = Number(process.env.WORKER_RUN_CONCURRENCY ?? 4);
const EMAIL_CONCURRENCY = Number(process.env.WORKER_EMAIL_CONCURRENCY ?? 16);

const runWorker = new Worker(
  QUEUES.RUN_EXECUTION,
  async (job) => {
    if (job.name === JOB_NAMES.EXECUTE_RUN) return processExecuteRun(job as never);
    if (job.name === JOB_NAMES.CANCEL_RUN) {
      // Real engine: tear down sandbox here. For now, status is already set
      // in the API route (markRunCanceled). The processor just acknowledges.
      console.log(`[cancel] acknowledged for ${job.data.runId}`);
      return;
    }
    console.warn(`[run worker] unknown job name: ${job.name}`);
  },
  { connection: getConnection(), concurrency: RUN_CONCURRENCY },
);

const emailWorker = new Worker(QUEUES.EMAIL, processSendEmail as never, {
  connection: getConnection(),
  concurrency: EMAIL_CONCURRENCY,
});

const billingWorker = new Worker(
  QUEUES.BILLING_RECONCILIATION,
  async (job) => {
    // Stub — implement metered billing reconciliation here when overage shipping.
    console.log(`[billing] reconcile stub for ${JSON.stringify(job.data)}`);
  },
  { connection: getConnection(), concurrency: 2 },
);

for (const [name, worker] of [
  ['run', runWorker],
  ['email', emailWorker],
  ['billing', billingWorker],
] as const) {
  worker.on('completed', (job) => {
    console.log(`[${name}] ${job.name} ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[${name}] ${job?.name} ${job?.id} failed:`, err);
  });
}

const shutdown = async (signal: string) => {
  console.log(`\n[worker] received ${signal}, shutting down…`);
  await Promise.allSettled([
    runWorker.close(),
    emailWorker.close(),
    billingWorker.close(),
  ]);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log(
  `[worker] up · run x${RUN_CONCURRENCY} · email x${EMAIL_CONCURRENCY} · billing x2`,
);
