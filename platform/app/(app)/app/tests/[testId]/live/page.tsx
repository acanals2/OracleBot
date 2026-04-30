import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Pause, SkipForward } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { getRunWithDetails } from '@/lib/runs';
import { LiveRefresh } from './LiveRefresh';

type Params = Promise<{ testId: string }>;

export default async function LiveTestPage({ params }: { params: Params }) {
  const { testId } = await params;
  const session = await requireSession();
  const detail = await getRunWithDetails(session.org.id, testId);
  if (!detail) notFound();
  const { run, events, metrics } = detail;

  const latest = metrics.at(-1);
  const isLive = run.status === 'running' || run.status === 'provisioning';

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title={run.name}
          subtitle={`Run ${run.id.slice(0, 8)} · ${run.mode} mode · status ${run.status}`}
        />
        <div className="flex-1 space-y-6 p-8">
          {isLive && <LiveRefresh runId={run.id} />}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  run.status === 'running'
                    ? 'warn'
                    : run.status === 'completed'
                      ? 'signal'
                      : 'default'
                }
              >
                {run.status}
              </Badge>
              {isLive && (
                <>
                  <form action={`/api/runs/${run.id}/cancel`} method="POST">
                    <Button type="submit" variant="secondary" size="sm">
                      <Pause className="mr-2 h-4 w-4" />
                      Cancel run
                    </Button>
                  </form>
                  <Button variant="ghost" size="sm" disabled>
                    <SkipForward className="mr-2 h-4 w-4" />
                    Jump to teardown
                  </Button>
                </>
              )}
            </div>
            {run.status === 'completed' && (
              <Link href={`/app/tests/${run.id}/results`}>
                <Button size="sm">View report</Button>
              </Link>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Active bots"
              value={`${(latest?.activeBots ?? 0).toLocaleString()} / ${run.botCount.toLocaleString()}`}
            />
            <MetricCard
              label="Current RPS"
              value={latest?.rps ? latest.rps.toFixed(0) : '—'}
            />
            <MetricCard
              label="Error rate"
              value={latest?.errorRate != null ? `${(latest.errorRate * 100).toFixed(2)}%` : '—'}
            />
            <MetricCard
              label="p95 latency"
              value={latest?.p95Ms ? `${latest.p95Ms.toFixed(0)} ms` : '—'}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Live event stream</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-ob-muted">Waiting for events…</p>
              ) : (
                <ul className="space-y-2 font-mono text-xs text-ob-muted">
                  {events.slice(0, 50).map((e) => (
                    <li key={e.id} className="flex justify-between border-b border-ob-line/60 pb-2">
                      <span className="text-ob-ink">
                        <span className="mr-2 uppercase tracking-wider text-ob-signal">{e.type}</span>
                        {e.message}
                      </span>
                      <span>{new Date(e.createdAt).toLocaleTimeString()}</span>
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
