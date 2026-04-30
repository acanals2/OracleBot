/**
 * POST /api/runs   — create a new run + enqueue execution
 * GET  /api/runs   — list runs for the current org
 */
import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import {
  createRun,
  createRunInputSchema,
  listRunsForOrg,
} from '@/lib/runs';
import { estimateRunCostCents } from '@/lib/billing';
import { enqueueExecuteRun } from '@/lib/queue';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const input = createRunInputSchema.parse(body);

    const costCentsEstimated = estimateRunCostCents({
      productKey: input.productKey,
      botCount: input.botCount,
      durationMinutes: input.durationMinutes,
    });

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
      // eslint-disable-next-line no-console
      console.warn('[api/runs] enqueue failed, run remains queued:', err);
    }

    return ok({ runId: run.id, status: run.status });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET() {
  try {
    const session = await requireSession();
    const runs = await listRunsForOrg(session.org.id, 100);
    return ok({ runs });
  } catch (e) {
    return apiError(e);
  }
}
