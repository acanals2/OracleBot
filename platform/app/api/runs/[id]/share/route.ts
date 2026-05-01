/**
 * POST /api/runs/:id/share  — create a public share link for the run.
 *
 * Response shape depends on the Accept header:
 *  - Accept: application/json (fetch from client components) →
 *      { ok: true, data: { token, url } }
 *  - Otherwise (HTML form posts) →
 *      302 redirect to /app/tests/:id/results?share=<token>
 *
 * The two-shape behaviour avoids forcing every call site through the
 * same plumbing while still letting the results-page form continue to
 * work without JS.
 */
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { createShareLink, getRunForOrg } from '@/lib/runs';
import { NotFoundError } from '@/lib/errors';

type Params = Promise<{ id: string }>;

export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const run = await getRunForOrg(session.org.id, id);
    if (!run) throw new NotFoundError('Run not found', { runId: id });

    const { token } = await createShareLink({
      runId: run.id,
      createdByUserId: session.user.id,
      expiresInDays: 30,
    });

    const wantsJson = (req.headers.get('accept') ?? '').includes('application/json');
    if (wantsJson) {
      return ok({ token, url: `/share/${token}` });
    }
    return redirect(`/app/tests/${id}/results?share=${token}`);
  } catch (e) {
    // Next's redirect() throws a special error that should propagate, not
    // be wrapped by apiError. Detect it by name + digest pattern.
    if ((e as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw e;
    return apiError(e);
  }
}
