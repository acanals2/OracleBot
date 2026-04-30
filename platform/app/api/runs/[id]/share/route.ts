/**
 * POST /api/runs/:id/share  — create a public share link for the report.
 * Returns the URL via redirect to the share-link landing inside the app.
 */
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { apiError } from '@/lib/api-helpers';
import { createShareLink, getRunForOrg } from '@/lib/runs';

type Params = Promise<{ id: string }>;

export async function POST(_req: Request, { params }: { params: Params }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const run = await getRunForOrg(session.org.id, id);
    if (!run) return new Response('not found', { status: 404 });

    const { token } = await createShareLink({
      runId: run.id,
      createdByUserId: session.user.id,
      expiresInDays: 30,
    });

    // Redirect back to the report with the token in the URL so the user can copy it.
    return redirect(`/app/tests/${id}/results?share=${token}`);
  } catch (e) {
    return apiError(e);
  }
}
