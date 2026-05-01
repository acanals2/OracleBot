import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ArrowRight, Play } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { listRunsForOrg } from '@/lib/runs';

function statusVariant(s: string): 'default' | 'signal' | 'warn' | 'muted' {
  if (s === 'completed') return 'signal';
  if (s === 'running' || s === 'provisioning') return 'warn';
  if (s === 'queued') return 'default';
  return 'muted';
}

export default async function AllRunsPage() {
  const session = await requireSession();
  const runs = await listRunsForOrg(session.org.id, 100).catch(() => []);

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar title="All runs" subtitle="Every test run in this workspace" />
        <div className="flex-1 space-y-8 p-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ob-muted">
              {runs.length === 0 ? 'No runs yet' : `${runs.length} runs`}
            </p>
            <Link href="/app/tests/new">
              <Button>
                <Play className="mr-2 h-4 w-4" />
                New test
              </Button>
            </Link>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Runs</CardTitle>
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
                      <th className="px-6 py-3">Score</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ob-line">
                    {runs.map((r) => {
                      // Every status routes somewhere meaningful: live mid-run,
                      // results once terminal. Failed / canceled / timed_out
                      // still go to /results so the user can see why.
                      const live =
                        r.status === 'running' ||
                        r.status === 'provisioning' ||
                        r.status === 'queued';
                      const href = live
                        ? `/app/tests/${r.id}/live`
                        : `/app/tests/${r.id}/results`;
                      const actionLabel = live ? 'Monitor' : 'Report';
                      return (
                        <tr
                          key={r.id}
                          className="cursor-pointer text-ob-muted transition-colors hover:bg-ob-surface/40"
                        >
                          <td className="px-6 py-4 font-medium text-ob-ink">
                            <Link
                              href={href}
                              className="block focus:outline-none focus:ring-1 focus:ring-ob-signal/40"
                            >
                              {r.name}
                            </Link>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs uppercase">
                            <Link href={href} className="block">
                              {r.mode}
                            </Link>
                          </td>
                          <td className="px-6 py-4 font-mono">
                            <Link href={href} className="block">
                              {r.botCount.toLocaleString()}
                            </Link>
                          </td>
                          <td className="px-6 py-4 font-mono">
                            <Link href={href} className="block">
                              {r.readinessScore != null ? `${r.readinessScore}` : '—'}
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <Link href={href} className="block">
                              <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link href={href}>
                              <Button
                                variant={live ? 'secondary' : 'ghost'}
                                size="sm"
                              >
                                {actionLabel}
                                <ArrowRight className="ml-1 h-4 w-4" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
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
