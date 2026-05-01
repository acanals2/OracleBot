/**
 * POST /api/runs/:id/cancel  — request cancellation. Worker reads the new
 * status next tick and tears down the sandbox.
 *
 * Form posts (the live page's Cancel button) get a 302 redirect back to the
 * live monitor so the browser navigates without a JS round-trip. The
 * NEXT_REDIRECT digest must propagate out of the try/catch — if apiError
 * wraps it we end up with a 500 carrying 'NEXT_REDIRECT' as the message and
 * the page blanks.
 */
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { apiError } from '@/lib/api-helpers';
import { getRunForOrg, markRunCanceled } from '@/lib/runs';
import { enqueueCancelRun } from '@/lib/queue';
import { NotFoundError } from '@/lib/errors';
import { logger, newTraceId } from '@/lib/logger';

type Params = Promise<{ id: string }>;

export async function POST(_req: Request, { params }: { params: Params }) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/runs/[id]/cancel' });
  const { id } = await params;

  try {
    const session = await requireSession();
    const run = await getRunForOrg(session.org.id, id);
    if (!run) throw new NotFoundError('Run not found', { runId: id }, traceId);

    // No-op for terminal runs — go back to the live page so the user sees state.
    if (
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'canceled' ||
      run.status === 'timed_out'
    ) {
      log.info(
        { event: 'run.cancel_noop', runId: id, status: run.status },
        'cancel ignored: run already terminal',
      );
    } else {
      await markRunCanceled(id, `Canceled by ${session.user.email}`);
      try {
        await enqueueCancelRun({ runId: id, reason: 'user_requested' });
      } catch (err) {
        log.warn(
          { event: 'run.cancel_enqueue_failed', runId: id, err: (err as Error).message },
          'cancel enqueued only in DB; worker will pick up status flip',
        );
      }
      log.info({ event: 'run.canceled', runId: id }, 'run canceled');
    }
  } catch (e) {
    // Critical: redirect() throws a NEXT_REDIRECT digest. Don't let it inside
    // this catch — but we don't have a redirect inside the try anymore, so
    // any throw here is a real error.
    if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e;
    return apiError(e, { traceId, context: { runId: id } });
  }

  // Redirect must live OUTSIDE the try so its NEXT_REDIRECT digest isn't
  // swallowed by apiError(). Next's redirect() works by throwing.
  redirect(`/app/tests/${id}/live`);
}
