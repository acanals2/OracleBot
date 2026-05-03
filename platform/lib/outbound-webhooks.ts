/**
 * Outbound webhook CRUD — Phase 18b.
 *
 * Mirror of webhook-subscriptions.ts but for the OUTBOUND direction:
 * we POST run.completed / run.failed payloads to URLs the customer
 * configured here. Worker delivery lives in worker/src/outbound.ts.
 */
import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import {
  outboundWebhooks,
  type OutboundWebhook,
  type NewOutboundWebhook,
} from './db/schema';
import { ForbiddenError, ValidationError } from './errors';

const HOOKS_PER_ORG_CAP = 20;

export const OUTBOUND_EVENT_TYPES = ['run.completed', 'run.failed'] as const;
export type OutboundEventType = (typeof OUTBOUND_EVENT_TYPES)[number];

/** Mint a fresh secret used to sign outbound POST bodies. */
export function mintOutboundSecret(): string {
  return 'obow_' + crypto.randomBytes(24).toString('base64url');
}

function validateUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('URL is malformed');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ValidationError('URL must use http(s)');
  }
  // SSRF guardrail: refuse loopback / link-local / private hosts in
  // production. Local dev still allows http://localhost. The worker
  // additionally enforces a 5-second timeout per request.
  if (process.env.NODE_ENV === 'production') {
    const host = parsed.hostname.toLowerCase();
    const isLocal =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal');
    if (isLocal) throw new ValidationError('URL host is not reachable from production');
    if (parsed.protocol !== 'https:') {
      throw new ValidationError('URL must use https in production');
    }
  }
}

export async function createOutboundWebhook(opts: {
  orgId: string;
  userId: string;
  label: string;
  url: string;
  events: OutboundEventType[];
}): Promise<{ raw: { secret: string }; row: OutboundWebhook }> {
  const label = opts.label.trim();
  if (!label) throw new ValidationError('Label is required');
  if (label.length > 120) throw new ValidationError('Label too long (max 120 chars)');
  validateUrl(opts.url);
  if (opts.events.length === 0) {
    throw new ValidationError('Pick at least one event type');
  }
  for (const e of opts.events) {
    if (!(OUTBOUND_EVENT_TYPES as readonly string[]).includes(e)) {
      throw new ValidationError(`Unknown event: ${e}`);
    }
  }

  const existing = await db
    .select({ id: outboundWebhooks.id })
    .from(outboundWebhooks)
    .where(eq(outboundWebhooks.orgId, opts.orgId));
  if (existing.length >= HOOKS_PER_ORG_CAP) {
    throw new ValidationError(`Cap of ${HOOKS_PER_ORG_CAP} outbound webhooks per org reached`);
  }

  const secret = mintOutboundSecret();
  const insert: NewOutboundWebhook = {
    orgId: opts.orgId,
    createdByUserId: opts.userId,
    label,
    url: opts.url,
    secret,
    events: opts.events,
    enabled: true,
  };
  const [row] = await db.insert(outboundWebhooks).values(insert).returning();
  return { raw: { secret }, row };
}

export async function listOutboundWebhooks(orgId: string): Promise<OutboundWebhook[]> {
  return db
    .select()
    .from(outboundWebhooks)
    .where(eq(outboundWebhooks.orgId, orgId))
    .orderBy(desc(outboundWebhooks.createdAt));
}

export async function deleteOutboundWebhook(orgId: string, id: string): Promise<void> {
  const result = await db
    .delete(outboundWebhooks)
    .where(and(eq(outboundWebhooks.id, id), eq(outboundWebhooks.orgId, orgId)))
    .returning({ id: outboundWebhooks.id });
  if (result.length === 0) {
    throw new ForbiddenError('Webhook not found or not yours');
  }
}

export async function setOutboundWebhookEnabled(
  orgId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  const result = await db
    .update(outboundWebhooks)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(outboundWebhooks.id, id), eq(outboundWebhooks.orgId, orgId)))
    .returning({ id: outboundWebhooks.id });
  if (result.length === 0) {
    throw new ForbiddenError('Webhook not found or not yours');
  }
}
