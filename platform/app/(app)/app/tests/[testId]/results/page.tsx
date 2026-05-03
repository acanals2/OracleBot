import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Button } from '@/components/ui/Button';
import { Download, Share2 } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { getRunWithDetails, listRunsForOrg } from '@/lib/runs';
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
  // Other completed runs for the compare dropdown. Cap at 25 to keep
  // the option list usable; users with more runs can compare via URL.
  const otherCompletedRuns = (await listRunsForOrg(session.org.id, 25).catch(() => []))
    .filter((r) => r.id !== run.id && r.status === 'completed');
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
            <a href={`/api/runs/${run.id}/findings.csv`}>
              <Button variant="ghost" size="sm">
                <Download className="mr-2 h-4 w-4" />
                Findings CSV
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
            {otherCompletedRuns.length > 0 && (
              <form className="flex items-center gap-2" action="/app/tests/compare" method="GET">
                <input type="hidden" name="b" value={run.id} />
                <select
                  name="a"
                  defaultValue=""
                  className="rounded-md border border-ob-line bg-ob-surface px-2 py-1.5 font-mono text-xs text-ob-ink"
                  aria-label="Compare with"
                >
                  <option value="" disabled>
                    Compare with…
                  </option>
                  {otherCompletedRuns.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name.length > 32 ? r.name.slice(0, 32) + '…' : r.name}
                      {r.readinessScore != null ? ` · ${r.readinessScore}/100` : ''}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="ghost" size="sm">
                  Diff
                </Button>
              </form>
            )}
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
