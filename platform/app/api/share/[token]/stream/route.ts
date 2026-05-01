/**
 * Public Server-Sent Events stream for spectator views.
 *
 *   GET /api/share/[token]/stream
 *
 * Auth: shareLinks.token must exist, not be revoked, not be expired.
 * No session required — the token IS the auth.
 *
 * Same SSE framing and message types as /api/runs/[id]/stream
 * (see lib/run-stream.ts for the shared loop).
 */
import { db } from '@/lib/db';
import { shareLinks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { apiError } from '@/lib/api-helpers';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { logger, newTraceId } from '@/lib/logger';
import { openRunStream, parseCursors } from '@/lib/run-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/share/[token]/stream' });

  const { token } = await ctx.params;

  let runId: string;
  try {
    const link = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.token, token),
      columns: { runId: true, revokedAt: true, expiresAt: true },
    });
    if (!link) throw new NotFoundError('Share link not found', { tokenPrefix: token.slice(0, 6) }, traceId);
    if (link.revokedAt) {
      throw new ForbiddenError('Share link revoked', { tokenPrefix: token.slice(0, 6) }, traceId);
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new ForbiddenError('Share link expired', { tokenPrefix: token.slice(0, 6) }, traceId);
    }
    runId = link.runId;
  } catch (e) {
    return apiError(e, { traceId, context: { tokenPrefix: token.slice(0, 6) } });
  }

  const cursors = parseCursors(req);
  const { stream, headers } = openRunStream({ runId, cursors, traceId, log });
  return new Response(stream, { headers });
}
