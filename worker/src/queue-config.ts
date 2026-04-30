/**
 * Worker-side BullMQ config. Constants must match the platform's
 * lib/queue.ts QUEUES + JOB_NAMES exactly.
 *
 * Connection hardening: ioredis is configured to retry forever on transient
 * failures so the worker survives short Redis outages without crashing
 * (Railway proxy blips, network hiccups, planned restarts of Redis).
 */
import IORedis from 'ioredis';
import type { ConnectionOptions } from 'bullmq';
import { logger } from './logger.js';
import { env } from './env.js';

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

  _conn = new IORedis(env.REDIS_URL, {
    // BullMQ requirement: blocking commands must not auto-fail after N retries.
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // Exponential-ish backoff capped at 5s. Returns null to stop retrying;
    // we never return null so the client retries forever.
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
    // Reconnect on transient errors. READONLY = Redis primary failover; the
    // others are network-level resets.
    reconnectOnError: (err: Error) =>
      /READONLY|ETIMEDOUT|ECONNRESET|EPIPE|EHOSTUNREACH/i.test(err.message),
  });

  _conn.on('error', (err: Error) => {
    logger.warn({ event: 'redis.error', err: err.message }, 'redis client error');
  });
  _conn.on('reconnecting', (delay: number) => {
    logger.warn({ event: 'redis.reconnecting', delayMs: delay }, 'redis reconnecting');
  });
  _conn.on('ready', () => {
    logger.info({ event: 'redis.ready' }, 'redis connected');
  });
  _conn.on('end', () => {
    logger.warn({ event: 'redis.end' }, 'redis connection ended');
  });

  return _conn;
}
