/**
 * Public live spectator. No auth — token is the only credential.
 * Renders the same Run Console layout as the authenticated live page,
 * but in read-only mode (cancel / share / kebab hidden).
 */
import { notFound } from 'next/navigation';
import { Eye } from 'lucide-react';
import { LiveRunProvider } from '@/components/run/LiveRunProvider';
import { LiveDashboard } from '@/components/run/LiveDashboard';
import { getRunWithDetailsByShareToken } from '@/lib/runs';

type Params = Promise<{ token: string }>;

export default async function PublicLivePage({ params }: { params: Params }) {
  const { token } = await params;
  const detail = await getRunWithDetailsByShareToken(token);
  if (!detail) notFound();
  const { run, events, metrics, findings } = detail;

  return (
    <div className="min-h-screen bg-ob-bg">
      <SpectatorBanner runName={run.name} />
      <div className="mx-auto max-w-7xl space-y-6 p-6 sm:p-8">
        <LiveRunProvider
          runId={run.id}
          shareToken={token}
          readOnly
          initial={{ run, metrics, events, findings }}
        >
          <LiveDashboard readOnly />
        </LiveRunProvider>
      </div>
    </div>
  );
}

function SpectatorBanner({ runName }: { runName: string }) {
  return (
    <div className="border-b border-ob-line bg-ob-surface/60 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-3 sm:px-8">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ob-muted">
          <Eye className="h-3.5 w-3.5" />
          <span>spectator view · {runName}</span>
        </div>
        <a
          href="/"
          className="font-mono text-[11px] uppercase tracking-widest text-ob-dim transition-colors hover:text-ob-ink"
        >
          oracle bot →
        </a>
      </div>
    </div>
  );
}
