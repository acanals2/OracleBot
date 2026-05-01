/**
 * Per-verification actions.
 *
 *   GET    /api/verify-target/[id]   — read row
 *   PATCH  /api/verify-target/[id]   — run the lookup, update state
 *   DELETE /api/verify-target/[id]   — revoke (defer; not implemented yet)
 */
import { NextRequest } from 'next/server';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { NotFoundError } from '@/lib/errors';
import {
  getVerificationForOrg,
  runVerification,
} from '@/lib/target-verification';
import { logger, newTraceId } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const traceId = newTraceId();
  try {
    const session = await requireSession();
    const { id } = await params;
    const row = await getVerificationForOrg(session.org.id, id);
    if (!row) throw new NotFoundError('Verification not found', { id }, traceId);
    return ok({ verification: row });
  } catch (e) {
    return apiError(e, { traceId });
  }
}

export async function PATCH(_req: NextRequest, { params }: { params: Params }) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/verify-target/[id]' });
  try {
    const session = await requireSession();
    const { id } = await params;
    const before = await getVerificationForOrg(session.org.id, id);
    if (!before) throw new NotFoundError('Verification not found', { id }, traceId);

    const after = await runVerification(session.org.id, id);
    log.info(
      {
        event: 'target_verification.checked',
        orgId: session.org.id,
        verificationId: id,
        domain: after.domain,
        method: after.method,
        statusBefore: before.status,
        statusAfter: after.status,
      },
      'verification check complete',
    );
    return ok({ verification: after });
  } catch (e) {
    return apiError(e, { traceId });
  }
}
