/**
 * Settings → Integrations (Phase 18).
 *
 * One subscription per (platform, externalProjectId). Each subscription
 * generates a webhook URL + secret that the user pastes into the codegen
 * platform's webhook config.
 */
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { requireSession } from '@/lib/auth';
import { listSubscriptions } from '@/lib/webhook-subscriptions';
import { IntegrationsClient } from './IntegrationsClient';

export default async function IntegrationsPage() {
  const session = await requireSession();
  const initial = await listSubscriptions(session.org.id);
  const safe = initial.map((s) => ({
    id: s.id,
    platform: s.platform,
    externalProjectId: s.externalProjectId,
    label: s.label,
    packs: s.packs ?? [],
    productKey: s.productKey,
    minScore: s.minScore,
    enabled: s.enabled,
    lastTriggeredAt: s.lastTriggeredAt ? s.lastTriggeredAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="Integrations"
          subtitle={`${session.org.name} · auto-trigger scans on Lovable / v0 / Bolt / Replit Agent deploys`}
        />
        <div className="flex-1 space-y-6 p-8">
          <IntegrationsClient initial={safe} />
        </div>
      </div>
    </div>
  );
}
