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
import { ForbiddenError, NotFoundError, RateLimitError } from '@/lib/errors';
import { logger, newTraceId } from '@/lib/logger';
import { openRunStream, parseCursors } from '@/lib/run-stream';
import { checkRateLimit, pruneRateLimitBuckets } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rate limit: max 30 SSE opens per minute per share token. Each open is
// a 9-second stream so 30/min keeps a single token capped at ~5 concurrent
// connections worst-case, which is well within "share with a few people"
// territory.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/share/[token]/stream' });

  const { token } = await ctx.params;
  const tokenPrefix = token.slice(0, 6);

  // Per-token rate limit before we touch the DB so a flood of bogus tokens
  // can't probe shareLinks for free.
  pruneRateLimitBuckets();
  const rl = checkRateLimit(`share:stream:${token}`, {
    windowMs: RATE_WINDOW_MS,
    max: RATE_MAX,
  });
  if (!rl.allowed) {
    log.warn(
      { event: 'share_stream.rate_limited', tokenPrefix, retryAfterSec: rl.retryAfterSec },
      'share stream rate-limited',
    );
    return apiError(
      new RateLimitError(
        `Too many requests for this share link. Retry in ${rl.retryAfterSec}s.`,
        { retryAfterSec: rl.retryAfterSec },
        traceId,
      ),
      { traceId, context: { tokenPrefix } },
    );
  }

  let runId: string;
  try {
    const link = await db.query.shareLinks.findFirst({
      where: eq(shareLinks.token, token),
      columns: { runId: true, revokedAt: true, expiresAt: true },
    });
    if (!link) throw new NotFoundError('Share link not found', { tokenPrefix }, traceId);
    if (link.revokedAt) {
      throw new ForbiddenError('Share link revoked', { tokenPrefix }, traceId);
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new ForbiddenError('Share link expired', { tokenPrefix }, traceId);
    }
    runId = link.runId;
  } catch (e) {
    return apiError(e, { traceId, context: { tokenPrefix } });
  }

  const cursors = parseCursors(req);
  const { stream, headers } = openRunStream({ runId, cursors, traceId, log });
  return new Response(stream, { headers });
}
