/**
 * POST /api/workspaces  — create a new workspace + seed starter files
 * GET  /api/workspaces  — list workspaces in the active org
 */
import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import {
  createWorkspaceForSession,
  createWorkspaceInput,
  listWorkspacesForOrg,
  WorkspaceLimitError,
} from '@/lib/workspaces';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const input = createWorkspaceInput.parse(body);
    const workspace = await createWorkspaceForSession(session, input);
    return ok({ workspace });
  } catch (e) {
    if (e instanceof WorkspaceLimitError) {
      return NextResponse.json(
        { ok: false, error: 'workspace_limit', message: e.message, cap: e.cap, count: e.count },
        { status: 403 },
      );
    }
    return apiError(e);
  }
}

export async function GET() {
  try {
    const session = await requireSession();
    const rows = await listWorkspacesForOrg(session.org.id);
    return ok({ workspaces: rows });
  } catch (e) {
    return apiError(e);
  }
}
