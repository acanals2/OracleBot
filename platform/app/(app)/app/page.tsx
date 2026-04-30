import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ArrowRight, Play } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { listRunsForOrg } from '@/lib/runs';
import { getDashboardStats } from '@/lib/dashboard-stats';

function statusVariant(s: string): 'default' | 'signal' | 'warn' | 'muted' {
  if (s === 'completed') return 'signal';
  if (s === 'running' || s === 'provisioning') return 'warn';
  if (s === 'queued') return 'default';
  return 'muted';
}

export default async function DashboardHomePage() {
  const session = await requireSession();
  const [runs, stats] = await Promise.all([
    listRunsForOrg(session.org.id, 25).catch(() => []),
    getDashboardStats(session.org.id).catch(() => null),
  ]);

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="Mission control"
          subtitle={`${session.org.name} · synthetic traffic, real infrastructure signals`}
        />
        <div className="flex-1 space-y-8 p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-ob-muted">
              Last updated <span className="font-mono text-ob-ink">just now</span> ·{' '}
              {runs.length === 0 ? 'no runs yet — start your first one' : `${runs.length} runs in workspace`}
            </p>
            <Link href="/app/tests/new">
              <Button>
                <Play className="mr-2 h-4 w-4" />
                New test
              </Button>
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total runs"
              value={stats?.totalRuns.toString() ?? '0'}
              hint="All time"
            />
            <MetricCard
              label="Avg readiness"
              value={stats?.avgReadiness != null ? `${stats.avgReadiness}` : '—'}
              hint="Across completed runs"
            />
            <MetricCard
              label="Completed"
              value={stats?.completedRuns.toString() ?? '0'}
              hint={stats?.totalRuns ? `of ${stats.totalRuns} total` : undefined}
            />
            <MetricCard
              label="Findings"
              value={stats?.totalFindings.toString() ?? '0'}
              hint={stats?.criticalFindings ? `${stats.criticalFindings} critical` : 'None critical'}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
              <CardTitle>Recent runs</CardTitle>
              <Link href="/app/tests/new">
                <Button variant="ghost" size="sm">
                  New test <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              {runs.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-ob-muted">No runs yet.</p>
                  <Link href="/app/tests/new" className="mt-4 inline-block">
                    <Button size="sm">Run your first test</Button>
                  </Link>
                </div>
              ) : (
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-ob-line font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                    <tr>
                      <th className="px-6 py-3">Name</th>
                      <th className="px-6 py-3">Mode</th>
                      <th className="px-6 py-3">Bots</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ob-line">
                    {runs.map((r) => (
                      <tr key={r.id} className="text-ob-muted hover:bg-ob-surface/40">
                        <td className="px-6 py-4 font-medium text-ob-ink">{r.name}</td>
                        <td className="px-6 py-4 font-mono text-xs uppercase">{r.mode}</td>
                        <td className="px-6 py-4 font-mono">{r.botCount.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {r.status === 'running' || r.status === 'provisioning' ? (
                            <Link href={`/app/tests/${r.id}/live`}>
                              <Button variant="secondary" size="sm">
                                Monitor
                              </Button>
                            </Link>
                          ) : r.status === 'completed' ? (
                            <Link href={`/app/tests/${r.id}/results`}>
                              <Button variant="ghost" size="sm">
                                Report
                              </Button>
                            </Link>
                          ) : null}
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
