/**
 * Audit log viewer — Phase 15a.
 *
 * Append-only timeline of org-affecting actions. Read-only on purpose;
 * exports + filters can come later. Joins to users so we can render
 * "<email> created token X" rather than raw IDs.
 */
import { eq } from 'drizzle-orm';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { requireSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { auditEvents, users } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, string> = {
  'token.created': 'Created API token',
  'token.revoked': 'Revoked API token',
  'run.canceled': 'Canceled run',
  'run.shared': 'Created share link',
  'run.share_revoked': 'Revoked share link',
  'webhook.subscription_created': 'Created codegen subscription',
  'webhook.subscription_deleted': 'Deleted codegen subscription',
  'webhook.outbound_created': 'Created outbound webhook',
  'webhook.outbound_deleted': 'Deleted outbound webhook',
  'webhook.outbound_toggled': 'Toggled outbound webhook',
  'target.verified': 'Verified target',
  'target.unverified': 'Unverified target',
  'workspace.created': 'Created workspace',
  'workspace.deleted': 'Deleted workspace',
  'billing.checkout_started': 'Started Stripe checkout',
  'billing.subscription_canceled': 'Canceled Stripe subscription',
};

export default async function AuditLogPage() {
  const session = await requireSession();
  // Single query: audit events left-joined to users so a deleted user's
  // events still render (with "—" actor).
  const rows = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      resourceId: auditEvents.resourceId,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      userEmail: users.email,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.userId, users.id))
    .where(eq(auditEvents.orgId, session.org.id))
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="Audit log"
          subtitle={`${session.org.name} · most recent 200 events`}
        />
        <div className="flex-1 space-y-6 p-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {rows.length === 0 ? (
                <p className="p-8 text-sm text-ob-muted">
                  No audit events yet. Records will appear here as you mint tokens, configure
                  webhooks, cancel runs, and so on.
                </p>
              ) : (
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-ob-line font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                    <tr>
                      <th className="px-6 py-3">When</th>
                      <th className="px-6 py-3">Who</th>
                      <th className="px-6 py-3">Action</th>
                      <th className="px-6 py-3">Resource</th>
                      <th className="px-6 py-3">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ob-line text-ob-muted">
                    {rows.map((r) => (
                      <tr key={r.id} className="hover:bg-ob-surface/40">
                        <td className="whitespace-nowrap px-6 py-3 font-mono text-xs">
                          {r.createdAt.toISOString().slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs">
                          {r.userEmail ?? <span className="text-ob-dim">system</span>}
                        </td>
                        <td className="px-6 py-3 text-ob-ink">
                          {ACTION_LABEL[r.action] ?? r.action}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs">
                          {r.resourceId ? (
                            <span className="truncate" title={r.resourceId}>
                              {r.resourceId.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="text-ob-dim">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3 font-mono text-[11px] text-ob-dim">
                          {r.metadata ? JSON.stringify(r.metadata).slice(0, 80) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
