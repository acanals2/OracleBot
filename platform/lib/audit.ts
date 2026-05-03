/**
 * Audit-log writer — Phase 15a.
 *
 * Single entry point: `record(...)`. Errors are swallowed and logged
 * because audit failures must NEVER block the action they describe —
 * an audit table outage is bad, but a request failing because of it
 * would be much worse (and we already have Sentry to notice the
 * underlying outage).
 *
 * Action namespaces are kept stable so the audit-viewer page can map
 * known actions to friendly labels. Add a new namespace when a new
 * surface needs auditing; never repurpose an old one.
 */
import { desc, eq } from 'drizzle-orm';
import { db } from './db';
import { auditEvents, type AuditEvent } from './db/schema';

export type AuditAction =
  | 'token.created'
  | 'token.revoked'
  | 'run.canceled'
  | 'run.shared'
  | 'run.share_revoked'
  | 'webhook.subscription_created'
  | 'webhook.subscription_deleted'
  | 'webhook.outbound_created'
  | 'webhook.outbound_deleted'
  | 'webhook.outbound_toggled'
  | 'target.verified'
  | 'target.unverified'
  | 'workspace.created'
  | 'workspace.deleted'
  | 'billing.checkout_started'
  | 'billing.subscription_canceled';

export interface RecordOpts {
  orgId: string;
  /** Null for system-initiated events (webhooks, scheduler). */
  userId: string | null;
  action: AuditAction;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function record(opts: RecordOpts): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      orgId: opts.orgId,
      userId: opts.userId ?? null,
      action: opts.action,
      resourceId: opts.resourceId ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    // Surface in logs but never throw — caller's action already succeeded.
    // eslint-disable-next-line no-console
    console.warn('audit.record failed', { action: opts.action, err: (err as Error).message });
  }
}

const PAGE_SIZE_DEFAULT = 100;
const PAGE_SIZE_MAX = 500;

export async function listForOrg(
  orgId: string,
  opts: { limit?: number } = {},
): Promise<AuditEvent[]> {
  const limit = Math.min(opts.limit ?? PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX);
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.orgId, orgId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}
