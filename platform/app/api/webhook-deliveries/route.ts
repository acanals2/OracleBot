/**
 * GET /api/webhook-deliveries
 *
 * Returns the last 30 webhook deliveries for the current org, joined with
 * the run that resulted (if any). Scoping happens via `runs.idempotencyKey`
 * — every codegen webhook stores the deliveryId there, so the join is
 * 1:1 for processed deliveries.
 *
 * Deliveries that errored out before a run was created (signature
 * mismatch, no subscription) won't appear here — they don't have a row
 * in `runs`. That's intentional: only deliveries that successfully
 * created a run for THIS org are this org's business.
 */
import { and, desc, eq, like } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { db } from '@/lib/db';
import { runs, webhookEvents } from '@/lib/db/schema';

export async function GET() {
  try {
    const session = await requireSession();

    // Pull the last 30 webhook-events whose idempotency id matches an
    // org-scoped run. The id format is `<platform>:<deliveryId>` and the
    // run's idempotencyKey carries the same value.
    const rows = await db
      .select({
        eventId: webhookEvents.id,
        type: webhookEvents.type,
        receivedAt: webhookEvents.receivedAt,
        processedAt: webhookEvents.processedAt,
        error: webhookEvents.error,
        runId: runs.id,
        runStatus: runs.status,
        runScore: runs.readinessScore,
        runTarget: runs.targetLiveUrl,
        runStartedAt: runs.startedAt,
      })
      .from(webhookEvents)
      .innerJoin(runs, eq(runs.idempotencyKey, webhookEvents.id))
      .where(
        and(
          eq(runs.orgId, session.org.id),
          // Phase 18 events only — id format `<platform>:<deliveryId>`.
          // Stripe webhook ids look like `evt_*` and don't contain ':',
          // so this filters them out cleanly.
          like(webhookEvents.id, '%:%'),
        ),
      )
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(30);

    return ok({
      deliveries: rows.map((r) => {
        const [platform, deliveryId] = r.eventId.split(':', 2);
        return {
          eventId: r.eventId,
          platform,
          deliveryId,
          type: r.type,
          receivedAt: r.receivedAt,
          processedAt: r.processedAt,
          error: r.error,
          runId: r.runId,
          runStatus: r.runStatus,
          runScore: r.runScore,
          runTarget: r.runTarget,
          runStartedAt: r.runStartedAt,
        };
      }),
    });
  } catch (e) {
    return apiError(e);
  }
}
