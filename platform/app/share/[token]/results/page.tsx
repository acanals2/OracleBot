/**
 * Public results spectator. Read-only version of the authenticated
 * results page — no PDF / share / re-run actions, no sidebar.
 */
import { notFound } from 'next/navigation';
import { Eye } from 'lucide-react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { RunSummaryCard } from '@/components/run/RunSummaryCard';
import { FindingsList } from '@/components/run/FindingsList';
import { getRunWithDetailsByShareToken } from '@/lib/runs';

type Params = Promise<{ token: string }>;

export default async function PublicResultsPage({ params }: { params: Params }) {
  const { token } = await params;
  const detail = await getRunWithDetailsByShareToken(token);
  if (!detail) notFound();
  const { run, findings } = detail;

  return (
    <div className="min-h-screen bg-ob-bg">
      <div className="border-b border-ob-line bg-ob-surface/60 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-3 sm:px-8">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ob-muted">
            <Eye className="h-3.5 w-3.5" />
            <span>
              spectator report · {run.name} ({run.id.slice(0, 8)})
            </span>
          </div>
          <a
            href="/"
            className="font-mono text-[11px] uppercase tracking-widest text-ob-dim transition-colors hover:text-ob-ink"
          >
            oracle bot →
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-8 p-6 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Readiness"
            value={run.readinessScore != null ? `${run.readinessScore}/100` : '—'}
          />
          <MetricCard label="Findings" value={findings.length.toString()} />
          <MetricCard
            label="Cost"
            value={
              run.costCentsActual != null
                ? `$${(run.costCentsActual / 100).toFixed(2)}`
                : run.costCentsEstimated != null
                  ? `~$${(run.costCentsEstimated / 100).toFixed(2)}`
                  : '—'
            }
          />
          <MetricCard
            label="Duration"
            value={
              run.completedAt && run.startedAt
                ? `${Math.round((+new Date(run.completedAt) - +new Date(run.startedAt)) / 60000)} min`
                : '—'
            }
          />
        </div>

        <RunSummaryCard run={run} findings={findings} />
        <FindingsList findings={findings} />
      </div>
    </div>
  );
}
