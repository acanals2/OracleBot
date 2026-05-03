/**
 * Settings → Outbound webhooks (Phase 18b).
 *
 * Customer-configured URLs that OracleBot POSTs to on run.completed /
 * run.failed. Differs from Integrations (which is INBOUND — codegen
 * deploys triggering scans).
 */
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { requireSession } from '@/lib/auth';
import { listOutboundWebhooks } from '@/lib/outbound-webhooks';
import { OutboundWebhooksClient } from './OutboundWebhooksClient';

export default async function OutboundWebhooksPage() {
  const session = await requireSession();
  const initial = await listOutboundWebhooks(session.org.id);
  const safe = initial.map((h) => ({
    id: h.id,
    label: h.label,
    url: h.url,
    events: h.events ?? [],
    enabled: h.enabled,
    lastDeliveredAt: h.lastDeliveredAt ? h.lastDeliveredAt.toISOString() : null,
    lastError: h.lastError,
    createdAt: h.createdAt.toISOString(),
  }));

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="Outbound webhooks"
          subtitle={`${session.org.name} · POST run.completed / run.failed payloads to your endpoints`}
        />
        <div className="flex-1 space-y-6 p-8">
          <OutboundWebhooksClient initial={safe} />
        </div>
      </div>
    </div>
  );
}
