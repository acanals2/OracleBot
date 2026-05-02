/**
 * GET  /api/tokens  — list non-revoked tokens for the active org
 * POST /api/tokens  — create a new token (returns the raw value once)
 *
 * Both endpoints use the regular session-cookie auth — managing tokens is
 * a user/browser action, not something a token should do for itself.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { createApiToken, listApiTokens } from '@/lib/api-tokens';

const createInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Optional ISO timestamp; null/undefined = no expiry. */
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const tokens = await listApiTokens(session.org.id);
    return ok({
      tokens: tokens.map((t) => ({
        id: t.id,
        name: t.name,
        prefix: t.tokenPrefix,
        expiresAt: t.expiresAt,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
      })),
    });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const input = createInputSchema.parse(body);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() < Date.now() + 60_000) {
      return apiError(new Error('Expiry must be at least one minute in the future.'));
    }

    const { raw, row } = await createApiToken({
      orgId: session.org.id,
      userId: session.user.id,
      name: input.name,
      expiresAt,
    });

    return ok({
      // Raw token shown ONCE. Caller must capture it now — we don't store it.
      token: raw,
      meta: {
        id: row.id,
        name: row.name,
        prefix: row.tokenPrefix,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
