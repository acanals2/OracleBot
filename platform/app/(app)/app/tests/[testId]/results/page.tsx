import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, Share2 } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { getRunWithDetails } from '@/lib/runs';

type Params = Promise<{ testId: string }>;

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger',
  high: 'border-ob-warn/40 bg-ob-warn/10 text-ob-warn',
  medium: 'border-ob-line bg-ob-surface text-ob-ink',
  low: 'border-ob-line bg-ob-surface/60 text-ob-muted',
  info: 'border-ob-line/40 bg-ob-bg/40 text-ob-dim',
};

export default async function TestResultsPage({ params }: { params: Params }) {
  const { testId } = await params;
  const session = await requireSession();
  const detail = await getRunWithDetails(session.org.id, testId);
  if (!detail) notFound();
  const { run, findings } = detail;

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
            <MetricCard label="Readiness" value={run.readinessScore != null ? `${run.readinessScore}/100` : '—'} />
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

          {run.summaryJson && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-lg bg-ob-bg/40 p-4 font-mono text-[11px] text-ob-muted">
                  {JSON.stringify(run.summaryJson, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Findings ({findings.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {findings.length === 0 ? (
                <p className="text-sm text-ob-muted">
                  No findings — that&apos;s good news. Re-run with adversarial intent if you want to dig deeper.
                </p>
              ) : (
                <ul className="space-y-3">
                  {findings.map((f) => (
                    <li
                      key={f.id}
                      className={`rounded-xl border p-4 ${SEVERITY_STYLES[f.severity] ?? ''}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-[11px] uppercase tracking-[0.16em]">
                          {f.severity} · {f.category}
                        </p>
                      </div>
                      <p className="mt-2 font-display text-base text-ob-ink">{f.title}</p>
                      <p className="mt-1 text-sm text-ob-muted">{f.description}</p>
                      {f.remediation && (
                        <p className="mt-3 rounded-lg border border-ob-line bg-ob-bg/40 p-3 text-xs text-ob-muted">
                          <span className="font-mono uppercase tracking-wider text-ob-signal">
                            Remediation:
                          </span>{' '}
                          {f.remediation}
                        </p>
                      )}
                      {f.fixPullRequestUrl && (
                        <a
                          href={f.fixPullRequestUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-block font-mono text-xs text-ob-signal hover:underline"
                        >
                          View AI-generated fix PR →
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
