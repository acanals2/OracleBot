/**
 * POST /api/runs/:id/cancel  — request cancellation. Worker reads the new
 * status next tick and tears down the sandbox.
 */
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { apiError } from '@/lib/api-helpers';
import { getRunForOrg, markRunCanceled } from '@/lib/runs';
import { enqueueCancelRun } from '@/lib/queue';

type Params = Promise<{ id: string }>;

export async function POST(_req: Request, { params }: { params: Params }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const run = await getRunForOrg(session.org.id, id);
    if (!run) {
      return new Response('not found', { status: 404 });
    }
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') {
      // already terminal — no-op
      return redirect(`/app/tests/${id}/live`);
    }

    await markRunCanceled(id, `Canceled by ${session.user.email}`);

    try {
      await enqueueCancelRun({ runId: id, reason: 'user_requested' });
    } catch {
      // best-effort
    }

    return redirect(`/app/tests/${id}/live`);
  } catch (e) {
    return apiError(e);
  }
}
