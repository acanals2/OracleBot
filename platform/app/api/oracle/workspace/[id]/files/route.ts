/**
 * GET /api/oracle/workspace/:id/files  — list files in the workspace tree.
 */
import { NextResponse } from 'next/server';
import { ensureWorkspace, getWorkspacePath, listWorkspaceFiles } from '@/lib/oracle-workspace';
import { loadWorkspaceForRequest } from '@/lib/workspaces';
import { apiError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await loadWorkspaceForRequest(id); // auth gate
    await ensureWorkspace(id);
    const [files, workspacePath] = await Promise.all([
      listWorkspaceFiles(id),
      getWorkspacePath(id),
    ]);
    return NextResponse.json({ id, workspacePath, files });
  } catch (e) {
    return apiError(e);
  }
}
