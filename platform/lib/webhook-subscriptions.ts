/**
 * Codegen webhook subscriptions — Phase 18.
 *
 * Each subscription binds an external codegen-platform project to an
 * OracleBot org + scan config. Webhooks come in at
 * /api/integrations/<platform>/deploy, get matched against this table by
 * (platform, externalProjectId), and trigger a run if found + verified.
 *
 * Secrets are stored at rest as plain text (we own the row, the user
 * created it explicitly, and it's only used to verify HMACs against
 * incoming signed payloads — same risk profile as Stripe webhook secrets).
 */
import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import {
  webhookSubscriptions,
  type WebhookSubscription,
  type NewWebhookSubscription,
} from './db/schema';
import { ForbiddenError, ValidationError } from './errors';

const PLATFORMS = ['lovable', 'v0', 'bolt', 'replit_agent', 'generic'] as const;
export type WebhookPlatform = (typeof PLATFORMS)[number];

const SUBS_PER_ORG_CAP = 25;

export function isWebhookPlatform(value: string): value is WebhookPlatform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/** Mint a fresh shared secret for HMAC-signed webhook payloads. */
export function mintWebhookSecret(): string {
  return 'obws_' + crypto.randomBytes(24).toString('base64url');
}

// ────────────────────────────────────────────────────────────────────────────
// Create / list / update / delete
// ────────────────────────────────────────────────────────────────────────────

export async function createSubscription(opts: {
  orgId: string;
  userId: string;
  platform: WebhookPlatform;
  externalProjectId: string;
  label: string;
  packs: string[];
  productKey: string;
  minScore?: number | null;
  targetVerificationId?: string | null;
}): Promise<{ raw: { secret: string }; row: WebhookSubscription }> {
  const label = opts.label.trim();
  if (!label) throw new ValidationError('Label is required');
  if (label.length > 120) throw new ValidationError('Label too long (max 120 chars)');
  if (!opts.externalProjectId.trim()) {
    throw new ValidationError('External project id is required');
  }
  if (opts.packs.length === 0) {
    throw new ValidationError('At least one probe pack must be selected');
  }

  const count = await countSubscriptions(opts.orgId);
  if (count >= SUBS_PER_ORG_CAP) {
    throw new ForbiddenError(
      `This organization already has ${count} webhook subscriptions (limit: ${SUBS_PER_ORG_CAP}).`,
    );
  }

  const secret = mintWebhookSecret();
  const insert: NewWebhookSubscription = {
    orgId: opts.orgId,
    createdByUserId: opts.userId,
    platform: opts.platform,
    externalProjectId: opts.externalProjectId.trim(),
    label,
    secret,
    packs: opts.packs,
    productKey: opts.productKey,
    minScore: opts.minScore ?? null,
    targetVerificationId: opts.targetVerificationId ?? null,
    enabled: true,
  };
  const [row] = await db.insert(webhookSubscriptions).values(insert).returning();
  return { raw: { secret }, row };
}

export async function listSubscriptions(orgId: string): Promise<WebhookSubscription[]> {
  return db.query.webhookSubscriptions.findMany({
    where: eq(webhookSubscriptions.orgId, orgId),
    orderBy: () => [desc(webhookSubscriptions.createdAt)],
  });
}

export async function setEnabled(
  orgId: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(webhookSubscriptions)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(webhookSubscriptions.orgId, orgId), eq(webhookSubscriptions.id, id)));
}

export async function deleteSubscription(orgId: string, id: string): Promise<void> {
  await db
    .delete(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.orgId, orgId), eq(webhookSubscriptions.id, id)));
}

async function countSubscriptions(orgId: string): Promise<number> {
  const rows = await db
    .select({ id: webhookSubscriptions.id })
    .from(webhookSubscriptions)
    .where(eq(webhookSubscriptions.orgId, orgId));
  return rows.length;
}

// ────────────────────────────────────────────────────────────────────────────
// Lookup + signature verification
// ────────────────────────────────────────────────────────────────────────────

/**
 * Find an enabled subscription for a (platform, externalProjectId) pair.
 * Returns null if not found, disabled, or deleted.
 */
export async function findSubscription(
  platform: WebhookPlatform,
  externalProjectId: string,
): Promise<WebhookSubscription | null> {
  const row = await db.query.webhookSubscriptions.findFirst({
    where: and(
      eq(webhookSubscriptions.platform, platform),
      eq(webhookSubscriptions.externalProjectId, externalProjectId),
    ),
  });
  if (!row) return null;
  if (!row.enabled) return null;
  return row;
}

/** Constant-time HMAC-SHA256 verification for `<header> = sha256=<hex>`. */
export function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Strip a `sha256=` prefix if the platform sends one (GitHub-style).
  const provided = signatureHeader.replace(/^sha256=/i, '').trim();
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

/** Bump lastTriggeredAt on a successful webhook fire. */
export async function markTriggered(id: string): Promise<void> {
  await db
    .update(webhookSubscriptions)
    .set({ lastTriggeredAt: new Date(), updatedAt: new Date() })
    .where(eq(webhookSubscriptions.id, id));
}
