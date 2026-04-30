/**
 * GET /api/oracle/workspace/:id/file?path=<relPath>  — read one file
 * PUT /api/oracle/workspace/:id/file                  — write one file
 *                                                       body: { path, content }
 */
import { NextResponse } from 'next/server';
import { readWorkspaceFile, writeWorkspaceFile } from '@/lib/oracle-workspace';
import { loadWorkspaceForRequest } from '@/lib/workspaces';
import { apiError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function GET(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await loadWorkspaceForRequest(id);
    const url = new URL(req.url);
    const p = url.searchParams.get('path');
    if (!p) {
      return NextResponse.json({ error: 'path query param required' }, { status: 400 });
    }
    const content = await readWorkspaceFile(id, p);
    if (content === null) {
      return NextResponse.json({ error: 'file not found' }, { status: 404 });
    }
    return NextResponse.json({ path: p, content, bytes: Buffer.byteLength(content, 'utf8') });
  } catch (e) {
    return apiError(e);
  }
}

export async function PUT(req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await loadWorkspaceForRequest(id);
    let body: { path?: string; content?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
    }
    if (!body.path || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'path and content required' },
        { status: 400 },
      );
    }
    try {
      const info = await writeWorkspaceFile(id, body.path, body.content);
      return NextResponse.json({ path: body.path, bytes: info.bytes });
    } catch (err) {
      // Path-traversal rejections + the like — surface as 400.
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'write failed' },
        { status: 400 },
      );
    }
  } catch (e) {
    return apiError(e);
  }
}
