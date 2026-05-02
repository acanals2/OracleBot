/**
 * DELETE /api/tokens/:id  — revoke a token (sets revoked_at on the row).
 */
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { revokeApiToken } from '@/lib/api-tokens';

type Params = Promise<{ id: string }>;

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    await revokeApiToken(session.org.id, id);
    return ok({ revoked: id });
  } catch (e) {
    return apiError(e);
  }
}
