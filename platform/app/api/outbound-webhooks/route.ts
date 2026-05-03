/**
 * GET  /api/outbound-webhooks  — list this org's outbound webhooks
 * POST /api/outbound-webhooks  — create one (returns secret ONCE)
 *
 * Session-cookie auth only. CI tokens (obt_*) shouldn't mint webhooks
 * — those are wired up by humans during integration setup.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import {
  OUTBOUND_EVENT_TYPES,
  createOutboundWebhook,
  listOutboundWebhooks,
} from '@/lib/outbound-webhooks';
import { record as auditRecord } from '@/lib/audit';

const createInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().url(),
  events: z.array(z.enum(OUTBOUND_EVENT_TYPES)).min(1),
});

export async function GET() {
  try {
    const session = await requireSession();
    const hooks = await listOutboundWebhooks(session.org.id);
    return ok({
      webhooks: hooks.map((h) => ({
        id: h.id,
        label: h.label,
        url: h.url,
        events: h.events,
        enabled: h.enabled,
        lastDeliveredAt: h.lastDeliveredAt,
        lastError: h.lastError,
        createdAt: h.createdAt,
        // secret is NEVER returned in listings
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
    const { raw, row } = await createOutboundWebhook({
      orgId: session.org.id,
      userId: session.user.id,
      label: input.label,
      url: input.url,
      events: input.events,
    });
    await auditRecord({
      orgId: session.org.id,
      userId: session.user.id,
      action: 'webhook.outbound_created',
      resourceId: row.id,
      metadata: { label: row.label, url: row.url, events: row.events },
    });
    return ok({
      // Show this ONCE. Customer must paste it into their server-side
      // signature verifier — see docs/integrations/webhooks.md.
      secret: raw.secret,
      meta: {
        id: row.id,
        label: row.label,
        url: row.url,
        events: row.events,
        enabled: row.enabled,
        createdAt: row.createdAt,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
