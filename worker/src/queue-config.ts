/**
 * Worker-side BullMQ config. Constants must match the platform's
 * lib/queue.ts QUEUES + JOB_NAMES exactly.
 */
import IORedis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';

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
  vars: Record<string, unknown>;
}
export interface ReconcileUsageJobData {
  orgId: string;
  date: string;
}

let _conn: IORedis | null = null;
export function getConnection(): ConnectionOptions {
  if (_conn) return _conn;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is not set');
  _conn = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return _conn;
}
