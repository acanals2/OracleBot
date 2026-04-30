/**
 * Preview lifecycle:
 *   POST   /api/oracle/preview/:id?hardRebuild=1  — start (or hard-rebuild)
 *   GET    /api/oracle/preview/:id                 — current state
 *   DELETE /api/oracle/preview/:id                 — stop
 */
import { NextResponse } from 'next/server';
import { getPreviewState, startPreview, stopPreview } from '@/lib/oracle-preview';
import { loadWorkspaceForRequest } from '@/lib/workspaces';
import { apiError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function POST(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await loadWorkspaceForRequest(id);
    const url = new URL(req.url);
    let hardRebuild = url.searchParams.get('hardRebuild') === '1';
    if (!hardRebuild) {
      try {
        const body = (await req.clone().json().catch(() => null)) as
          | { hardRebuild?: boolean }
          | null;
        if (body?.hardRebuild === true) hardRebuild = true;
      } catch {
        /* body optional */
      }
    }
    const state = await startPreview(id, { hardRebuild });
    return NextResponse.json(state);
  } catch (e) {
    return apiError(e);
  }
}

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await loadWorkspaceForRequest(id);
    const state = getPreviewState(id);
    if (!state) return NextResponse.json({ status: 'idle', id, log: [] });
    return NextResponse.json(state);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await loadWorkspaceForRequest(id);
    const okStop = stopPreview(id);
    return NextResponse.json({ stopped: okStop });
  } catch (e) {
    return apiError(e);
  }
}
