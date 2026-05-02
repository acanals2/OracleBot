import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Button } from '@/components/ui/Button';
import { Download, Share2 } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { getRunWithDetails } from '@/lib/runs';
import { verificationIdForRun } from '@/lib/badge';
import { RunSummaryCard } from '@/components/run/RunSummaryCard';
import { FindingsList } from '@/components/run/FindingsList';
import { PublishScoreCard } from '@/components/run/PublishScoreCard';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

type Params = Promise<{ testId: string }>;

export default async function TestResultsPage({ params }: { params: Params }) {
  const { testId } = await params;
  const session = await requireSession();
  const detail = await getRunWithDetails(session.org.id, testId);
  if (!detail) notFound();
  const { run, findings } = detail;
  // Phase 14: only fetch the verification id when the run actually completed
  // with a real score — saves a query on in-flight or failed runs.
  const verificationId =
    run.status === 'completed' && run.readinessScore != null
      ? await verificationIdForRun(run)
      : null;
  const targetHost = (() => {
    const t = run.targetLiveUrl ?? run.targetAgentEndpoint;
    if (!t) return null;
    try {
      return new URL(t).hostname;
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title={`${run.name} — Oracle Report`}
          subtitle={`${run.id.slice(0, 8)} · ${run.mode} mode · ${run.botCount.toLocaleString()} personas · ${run.durationMinutes} min`}
        />
        <div className="flex-1 space-y-8 p-8">
          <div className="flex flex-wrap gap-2">
            <a href={`/api/runs/${run.id}/report.pdf`} target="_blank" rel="noreferrer">
              <Button variant="secondary" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            </a>
            <form action={`/api/runs/${run.id}/share`} method="POST">
              <Button type="submit" variant="ghost" size="sm">
                <Share2 className="mr-2 h-4 w-4" />
                Create share link
              </Button>
            </form>
            <Link href="/app/tests/new">
              <Button size="sm">Re-run with changes</Button>
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Readiness"
              value={run.readinessScore != null ? `${run.readinessScore}/100` : '—'}
              info="0–100 score derived from finding severities. Critical = −25, High = −12, Medium = −6, Low = −2, Info = −0.5. A run with zero findings scores 100."
            />
            <MetricCard
              label="Findings"
              value={findings.length.toString()}
              info="Total issues surfaced during the run. Use the severity chips below to filter the list."
            />
            <MetricCard
              label="Cost"
              value={
                run.costCentsActual != null
                  ? `$${(run.costCentsActual / 100).toFixed(2)}`
                  : run.costCentsEstimated != null
                    ? `~$${(run.costCentsEstimated / 100).toFixed(2)}`
                    : '—'
              }
              info="Actual sandbox + AI inference cost for this run. While running, this shows the estimate; the final amount appears on completion."
            />
            <MetricCard
              label="Duration"
              value={
                run.completedAt && run.startedAt
                  ? `${Math.round((+new Date(run.completedAt) - +new Date(run.startedAt)) / 60000)} min`
                  : '—'
              }
              info="Wall-clock time from bot execution start to run completion (excludes provisioning)."
            />
          </div>

          <RunSummaryCard run={run} findings={findings} />

          {run.status === 'completed' && run.readinessScore != null && (
            <PublishScoreCard
              verificationId={verificationId}
              appUrl={APP_URL}
              score={run.readinessScore}
              targetHost={targetHost}
            />
          )}

          <FindingsList findings={findings} />
        </div>
      </div>
    </div>
  );
}
