/**
 * GET    /api/workspaces/:id  — return workspace metadata
 * DELETE /api/workspaces/:id  — destroy DB row + on-disk files
 */
import { apiError, ok } from '@/lib/api-helpers';
import {
  deleteWorkspaceForSession,
  loadWorkspaceForRequest,
  touchWorkspace,
} from '@/lib/workspaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const { workspace } = await loadWorkspaceForRequest(id);
    await touchWorkspace(id).catch(() => {});
    return ok({ workspace });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const { session } = await loadWorkspaceForRequest(id);
    await deleteWorkspaceForSession(session, id);
    return ok({ deleted: id });
  } catch (e) {
    return apiError(e);
  }
}
