'use client';

/**
 * Client-side render of the live-run dashboard. Reads from LiveRunProvider's
 * context so cards and the event stream update in real time as SSE messages
 * arrive. Visual layout matches the previous server-rendered version one-to-one
 * to make this swap a pure data-flow change; richer visualization (chart,
 * tooltips, layout overhaul) lands in A.3.
 */
import Link from 'next/link';
import { Pause, SkipForward, Wifi, WifiOff } from 'lucide-react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLiveRun } from './LiveRunProvider';

export function LiveDashboard() {
  const { run, metrics, events, status, isLive, connection } = useLiveRun();
  const latest = metrics.at(-1);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              status === 'running' ? 'warn' : status === 'completed' ? 'signal' : 'default'
            }
          >
            {status}
          </Badge>
          {isLive && <ConnectionIndicator state={connection} />}
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
        {status === 'completed' && (
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
          value={latest?.rps != null ? latest.rps.toFixed(0) : '—'}
        />
        <MetricCard
          label="Error rate"
          value={latest?.errorRate != null ? `${(latest.errorRate * 100).toFixed(2)}%` : '—'}
        />
        <MetricCard
          label="p95 latency"
          value={latest?.p95Ms != null ? `${latest.p95Ms.toFixed(0)} ms` : '—'}
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
    </>
  );
}

function ConnectionIndicator({ state }: { state: 'idle' | 'connecting' | 'open' | 'closed' | 'error' }) {
  if (state === 'open') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-ob-line bg-ob-surface px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ob-signal">
        <Wifi className="h-3 w-3" /> live
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-ob-line bg-ob-surface px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ob-danger">
        <WifiOff className="h-3 w-3" /> reconnecting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-ob-line bg-ob-surface px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ob-muted">
      <Wifi className="h-3 w-3" /> {state}
    </span>
  );
}
