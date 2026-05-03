/**
 * Worker-side notification helpers. Enqueues email jobs onto the same
 * BullMQ EMAIL queue the worker itself consumes. Decoupling the producer
 * from the consumer means a Resend outage doesn't block run completion —
 * jobs sit in the queue and retry with exponential backoff.
 *
 * Email recipient resolution: we send to every member of the run's org.
 * For solo orgs that's one row; for multi-member orgs everyone who's
 * been invited gets a copy. Errors here NEVER fail the run — they are
 * logged and swallowed because run state is already persisted by the
 * time we get here.
 */
import { Queue } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { db, runs, users, members } from './db.js';
import { JOB_NAMES, QUEUES, getConnection, type SendEmailJobData } from './queue-config.js';
import { logger } from './logger.js';

let _emailQueue: Queue<SendEmailJobData> | null = null;
function emailQueue(): Queue<SendEmailJobData> {
  if (_emailQueue) return _emailQueue;
  _emailQueue = new Queue<SendEmailJobData>(QUEUES.EMAIL, {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 60 * 60 * 24 * 7 },
      removeOnFail: { age: 60 * 60 * 24 * 30 },
    },
  });
  return _emailQueue;
}

/** Resolves the marketing/app base URL — used to build absolute report links. */
function appBaseUrl(): string {
  return process.env.APP_BASE_URL ?? 'https://oraclebot.net';
}

/** Returns every member email for an org. One row per user. */
async function recipientsForOrg(orgId: string): Promise<{ email: string; name: string | null }[]> {
  return db
    .select({ email: users.email, name: users.name })
    .from(members)
    .innerJoin(users, eq(members.userId, users.id))
    .where(eq(members.orgId, orgId));
}

export async function notifyRunCompleted(runId: string): Promise<void> {
  try {
    const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!run) return;

    const findingsCount = (
      await db.execute(
        sql`SELECT COUNT(*)::int AS c FROM run_findings WHERE run_id = ${runId}`,
      )
    );
    const rows = (Array.isArray(findingsCount)
      ? findingsCount
      : ((findingsCount as unknown as { rows?: unknown[] }).rows ?? [])) as { c: number }[];
    const count = rows[0]?.c ?? 0;

    const recipients = await recipientsForOrg(run.orgId);
    if (recipients.length === 0) {
      logger.info({ event: 'notify.no_recipients', runId }, 'no recipients for run');
      return;
    }

    const reportUrl = `${appBaseUrl()}/app/tests/${runId}/results`;
    for (const r of recipients) {
      await emailQueue().add(JOB_NAMES.SEND_EMAIL, {
        template: 'run_completed',
        to: r.email,
        vars: {
          recipientName: r.name ?? r.email.split('@')[0],
          runName: run.name,
          mode: run.mode,
          readinessScore: run.readinessScore,
          findingsCount: count,
          reportUrl,
        },
      });
    }
    logger.info(
      { event: 'notify.run_completed_enqueued', runId, count: recipients.length },
      'completion email(s) enqueued',
    );
  } catch (err) {
    // Never fail the run for notification errors.
    logger.warn(
      { event: 'notify.run_completed_failed', runId, err: (err as Error).message },
      'completion notify failed',
    );
  }
}

export async function notifyRunFailed(runId: string, errorSummary: string): Promise<void> {
  try {
    const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
    if (!run) return;

    const recipients = await recipientsForOrg(run.orgId);
    if (recipients.length === 0) return;

    const reportUrl = `${appBaseUrl()}/app/tests/${runId}/results`;
    for (const r of recipients) {
      await emailQueue().add(JOB_NAMES.SEND_EMAIL, {
        template: 'run_failed',
        to: r.email,
        vars: {
          recipientName: r.name ?? r.email.split('@')[0],
          runName: run.name,
          mode: run.mode,
          errorSummary,
          reportUrl,
        },
      });
    }
    logger.info(
      { event: 'notify.run_failed_enqueued', runId, count: recipients.length },
      'failure email(s) enqueued',
    );
  } catch (err) {
    logger.warn(
      { event: 'notify.run_failed_failed', runId, err: (err as Error).message },
      'failure notify failed',
    );
  }
}
