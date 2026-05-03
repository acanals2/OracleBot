/**
 * GET  /api/webhook-subscriptions  — list this org's subscriptions
 * POST /api/webhook-subscriptions  — create a new one (returns secret once)
 *
 * Session-cookie auth only. Token-bearing CI clients should not be able to
 * mint subscriptions on the user's behalf.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import {
  createSubscription,
  isWebhookPlatform,
  listSubscriptions,
} from '@/lib/webhook-subscriptions';

const PLATFORM_VALUES = ['lovable', 'v0', 'bolt', 'replit_agent', 'generic'] as const;
const PRODUCT_KEYS = ['free', 'scout', 'builder', 'studio', 'stack'] as const;

const createInputSchema = z.object({
  platform: z.enum(PLATFORM_VALUES),
  externalProjectId: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(120),
  packs: z.array(z.string()).min(1),
  productKey: z.enum(PRODUCT_KEYS),
  minScore: z.number().int().min(0).max(100).nullable().optional(),
  targetVerificationId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  try {
    const session = await requireSession();
    const subs = await listSubscriptions(session.org.id);
    return ok({
      subscriptions: subs.map((s) => ({
        id: s.id,
        platform: s.platform,
        externalProjectId: s.externalProjectId,
        label: s.label,
        packs: s.packs,
        productKey: s.productKey,
        minScore: s.minScore,
        targetVerificationId: s.targetVerificationId,
        enabled: s.enabled,
        lastTriggeredAt: s.lastTriggeredAt,
        createdAt: s.createdAt,
        // secret is NEVER returned in listings — only on initial create
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
    if (!isWebhookPlatform(input.platform)) {
      return apiError(new Error('Unknown platform'));
    }
    const { raw, row } = await createSubscription({
      orgId: session.org.id,
      userId: session.user.id,
      platform: input.platform,
      externalProjectId: input.externalProjectId,
      label: input.label,
      packs: input.packs,
      productKey: input.productKey,
      minScore: input.minScore ?? null,
      targetVerificationId: input.targetVerificationId ?? null,
    });
    return ok({
      // Secret is shown once. Store it in your platform's webhook secret
      // field (Lovable: Project → Webhooks → Secret. v0: Project → Settings →
      // Webhooks. etc).
      secret: raw.secret,
      meta: {
        id: row.id,
        platform: row.platform,
        externalProjectId: row.externalProjectId,
        label: row.label,
        packs: row.packs,
        productKey: row.productKey,
        minScore: row.minScore,
        enabled: row.enabled,
        createdAt: row.createdAt,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
