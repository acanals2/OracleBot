/**
 * GET /api/entitlements  — what is the current org allowed to do right now?
 *
 * Read by the run wizard (to dim tier cards the org hasn't bought) and by
 * the billing page (to surface free-tier remaining + warning states).
 *
 * Returns the full Entitlements object from lib/entitlements.ts unchanged.
 */
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { getEntitlements } from '@/lib/entitlements';
import { newTraceId } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const traceId = newTraceId();
  try {
    const session = await requireSession();
    const ent = await getEntitlements(session.org.id);
    return ok({ entitlements: ent });
  } catch (e) {
    return apiError(e, { traceId });
  }
}
