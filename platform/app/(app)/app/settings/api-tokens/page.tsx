/**
 * Settings → API tokens (Phase 17).
 *
 * Lists the org's non-revoked API tokens, lets the user mint a new one,
 * shows the raw token exactly once, lets the user revoke. The raw token
 * never round-trips back to the server after creation — we don't store
 * it, so we can't show it again.
 */
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { requireSession } from '@/lib/auth';
import { listApiTokens } from '@/lib/api-tokens';
import { ApiTokensClient } from './ApiTokensClient';

export default async function ApiTokensPage() {
  const session = await requireSession();
  const initial = await listApiTokens(session.org.id);
  // Only safe-to-render fields make it to the client. Hash + prefix are
  // already lookup-only on the server.
  const safe = initial.map((t) => ({
    id: t.id,
    name: t.name,
    prefix: t.tokenPrefix,
    expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="API tokens"
          subtitle={`${session.org.name} · authenticate the OracleBot CLI, GitHub Action, and CI integrations`}
        />
        <div className="flex-1 space-y-6 p-8">
          <ApiTokensClient initial={safe} />
        </div>
      </div>
    </div>
  );
}
