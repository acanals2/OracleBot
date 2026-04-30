/**
 * BullMQ producer + shared queue/job-name constants.
 *
 * The web app *enqueues* jobs (this file). The worker process *consumes* them
 * (worker/src/index.ts). They share this file's constants so naming stays in
 * sync.
 *
 * Queue strategy:
 *   - one queue per "kind of work" (run-execution, email, billing-reconciliation)
 *   - jobs are idempotent — workers can safely retry
 *   - run jobs carry only the run UUID; the worker re-fetches state from DB
 */
import { Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from './logger';
import { env } from './env';

export const QUEUES = {
  RUN_EXECUTION: 'run-execution',
  EMAIL: 'email',
  BILLING_RECONCILIATION: 'billing-reconciliation',
} as const;

export const JOB_NAMES = {
  EXECUTE_RUN: 'execute-run',
  CANCEL_RUN: 'cancel-run',
  SEND_EMAIL: 'send-email',
  RECONCILE_USAGE: 'reconcile-usage',
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Job payloads — keep these tiny. Workers re-hydrate from DB.
// ────────────────────────────────────────────────────────────────────────────

export interface ExecuteRunJobData {
  runId: string;
  orgId: string;
}

export interface CancelRunJobData {
  runId: string;
  reason?: string;
}

export interface SendEmailJobData {
  template: 'run_completed' | 'run_failed' | 'welcome' | 'invoice_receipt';
  to: string;
  /** Template-specific variables (validated by the email lib at send time) */
  vars: Record<string, unknown>;
}

export interface ReconcileUsageJobData {
  orgId: string;
  /** ISO date covering the day to reconcile metered overage for */
  date: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Connection — IORedis singleton, lazy
// ────────────────────────────────────────────────────────────────────────────

let _connection: IORedis | null = null;

function getConnection(): IORedis {
  if (_connection) return _connection;
  _connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ requirement
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
    reconnectOnError: (err: Error) =>
      /READONLY|ETIMEDOUT|ECONNRESET|EPIPE|EHOSTUNREACH/i.test(err.message),
  });
  _connection.on('error', (err: Error) => {
    logger.warn({ event: 'redis.error', err: err.message }, 'redis client error');
  });
  _connection.on('reconnecting', (delay: number) => {
    logger.warn({ event: 'redis.reconnecting', delayMs: delay }, 'redis reconnecting');
  });
  return _connection;
}

export function getQueueConnection(): ConnectionOptions {
  return getConnection();
}

// ────────────────────────────────────────────────────────────────────────────
// Queue singletons (producers)
// ────────────────────────────────────────────────────────────────────────────

let _runQueue: Queue<ExecuteRunJobData | CancelRunJobData> | null = null;
let _emailQueue: Queue<SendEmailJobData> | null = null;
let _billingQueue: Queue<ReconcileUsageJobData> | null = null;

export function runQueue() {
  if (_runQueue) return _runQueue;
  _runQueue = new Queue(QUEUES.RUN_EXECUTION, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
      // Keep the most recent 5,000 fully-failed jobs in Redis for inspection
      // and indefinitely (until evicted). The worker also writes them to the
      // `dead_jobs` Postgres table so they survive Redis being wiped.
      removeOnFail: { count: 5000 },
    },
  });
  return _runQueue;
}

export function emailQueue() {
  if (_emailQueue) return _emailQueue;
  _emailQueue = new Queue(QUEUES.EMAIL, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 60 * 60 * 24 * 7 },
      removeOnFail: { age: 60 * 60 * 24 * 30 },
    },
  });
  return _emailQueue;
}

export function billingQueue() {
  if (_billingQueue) return _billingQueue;
  _billingQueue = new Queue(QUEUES.BILLING_RECONCILIATION, {
    connection: getQueueConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 60 * 60 * 24 * 30 },
    },
  });
  return _billingQueue;
}

// ────────────────────────────────────────────────────────────────────────────
// Public producers — call these from API routes / server actions.
// ────────────────────────────────────────────────────────────────────────────

export async function enqueueExecuteRun(data: ExecuteRunJobData) {
  return runQueue().add(JOB_NAMES.EXECUTE_RUN, data, {
    jobId: `run_${data.runId}`, // dedupe by run
  });
}

export async function enqueueCancelRun(data: CancelRunJobData) {
  return runQueue().add(JOB_NAMES.CANCEL_RUN, data, {
    jobId: `cancel_${data.runId}`,
  });
}

export async function enqueueEmail(data: SendEmailJobData) {
  return emailQueue().add(JOB_NAMES.SEND_EMAIL, data);
}

export async function enqueueUsageReconciliation(data: ReconcileUsageJobData) {
  return billingQueue().add(JOB_NAMES.RECONCILE_USAGE, data, {
    jobId: `reconcile_${data.orgId}_${data.date}`,
  });
}
