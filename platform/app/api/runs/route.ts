/**
 * POST /api/runs   — create a new run + enqueue execution
 * GET  /api/runs   — list runs for the current org
 *
 * Run-creation is gated on domain verification (Phase 3): for `liveUrl` and
 * `agent` targets we resolve the host and assert the requesting org has a
 * verified entry in `target_verifications` (or the host is on the carve-out
 * list). `repo` and `docker` targets skip this check — those run inside a
 * sandbox we provision, so domain ownership doesn't apply.
 */
import { NextRequest } from 'next/server';
import { requireSessionOrToken } from '@/lib/api-tokens';
import { apiError, ok } from '@/lib/api-helpers';
import {
  createRun,
  createRunInputSchema,
  listRunsForOrg,
} from '@/lib/runs';
import { estimateRunCostCents } from '@/lib/billing';
import { enqueueExecuteRun } from '@/lib/queue';
import { assertDomainVerified } from '@/lib/target-verification';
import { assertCanCreateRun } from '@/lib/entitlements';
import { logger, newTraceId } from '@/lib/logger';

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/runs' });
  try {
    const session = await requireSessionOrToken();
    const body = await req.json();
    const input = createRunInputSchema.parse(body);

    // Domain verification gate — applies to liveUrl + agent targets.
    if (input.target.kind === 'liveUrl') {
      await assertDomainVerified(session.org.id, input.target.url);
    } else if (input.target.kind === 'agent') {
      await assertDomainVerified(session.org.id, input.target.endpoint);
    }

    const costCentsEstimated = estimateRunCostCents({
      productKey: input.productKey,
      botCount: input.botCount,
      durationMinutes: input.durationMinutes,
    });

    // Entitlement gate — refuses if no active sub, no credits, and no
    // free-tier runs left. Throws ForbiddenError carrying a human-readable
    // blockedReason that the wizard surfaces inline.
    await assertCanCreateRun(
      session.org.id,
      { productKey: input.productKey, costCentsEstimated },
      traceId,
    );

    const run = await createRun({
      orgId: session.org.id,
      userId: session.user.id,
      input,
      costCentsEstimated,
    });

    // Enqueue best-effort. If Redis is down, the run sits in `queued` and a
    // healthcheck cron can reconcile.
    try {
      await enqueueExecuteRun({ runId: run.id, orgId: session.org.id });
    } catch (err) {
      log.warn(
        { event: 'run.enqueue_failed', runId: run.id, err: (err as Error).message },
        'enqueue failed; run remains queued',
      );
    }

    return ok({ runId: run.id, status: run.status });
  } catch (e) {
    return apiError(e, { traceId });
  }
}

export async function GET() {
  const traceId = newTraceId();
  try {
    const session = await requireSessionOrToken();
    const runs = await listRunsForOrg(session.org.id, 100);
    return ok({ runs });
  } catch (e) {
    return apiError(e, { traceId });
  }
}
