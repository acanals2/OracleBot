/**
 * GET /api/runs/:id  — return run + findings + recent events for the dashboard.
 */
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { getRunWithDetails } from '@/lib/runs';
import { NextResponse } from 'next/server';

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const detail = await getRunWithDetails(session.org.id, id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    return ok(detail);
  } catch (e) {
    return apiError(e);
  }
}
