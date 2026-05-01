'use client';

/**
 * Six-up live KPI strip for the Run Console. Active bots, RPS, error rate,
 * p50, p95, and a live cost projection. Each card carries a sparkline of
 * the last N samples so the user sees trend at a glance.
 *
 * Reads from useLiveRun() so values + sparklines update incrementally.
 * The cost card is computed client-side from elapsed × estimated rate
 * (the worker owns the authoritative `costCentsActual` post-completion).
 */
import { useEffect, useState } from 'react';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { Sparkline } from './Sparkline';
import { useLiveRun } from './LiveRunProvider';

const TERMINAL = new Set(['completed', 'failed', 'canceled', 'timed_out']);

const SPARK_WIDTH = 80;
const SPARK_HEIGHT = 24;

export function KpiStrip() {
  const { run, metrics, status } = useLiveRun();
  const latest = metrics.at(-1);
  const isLive = !TERMINAL.has(status);
  const isCompleted = status === 'completed';

  // Tick a clock so the cost card updates per second even when no metric
  // has arrived (cost is purely a function of elapsed time + rate).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [isLive]);

  // Cost projection — see C.17 in the plan.
  const startedAtMs = run.startedAt ? new Date(run.startedAt).getTime() : null;
  const completedAtMs = run.completedAt ? new Date(run.completedAt).getTime() : null;
  const elapsedMs = startedAtMs ? Math.max(0, (completedAtMs ?? now) - startedAtMs) : 0;
  const totalMs = run.durationMinutes * 60_000;
  const ratePerMs = totalMs > 0 ? (run.costCentsEstimated ?? 0) / totalMs : 0;

  // For terminal completed runs, prefer the worker's authoritative actual
  // cost. For mid-run, use the projection.
  const liveCostCents = isCompleted && run.costCentsActual != null
    ? run.costCentsActual
    : Math.round(ratePerMs * elapsedMs);

  const burnPct = run.hardCapCents ? liveCostCents / run.hardCapCents : 0;
  const costTone: 'default' | 'warn' | 'danger' =
    burnPct >= 1 ? 'danger' : burnPct >= 0.8 ? 'warn' : 'default';

  // Build sparkline series for each KPI from the metrics array.
  // We tail to the last 60 samples so a long-running set stays performant
  // and the sparkline focuses on recent trend.
  const tail = metrics.slice(-60);
  const activeBotsSeries = tail.map((m) => m.activeBots ?? null);
  const rpsSeries = tail.map((m) => m.rps ?? null);
  const errorSeries = tail.map((m) => (m.errorRate ?? null) as number | null);
  const p50Series = tail.map((m) => m.p50Ms ?? null);
  const p95Series = tail.map((m) => m.p95Ms ?? null);

  // Cost sparkline: synthetic — a linear ramp to current value. We don't
  // store cost time-series anywhere; the projection is monotonic so a
  // straight line is honest.
  const costSeries =
    tail.length >= 2
      ? tail.map((_, i) => (liveCostCents * (i + 1)) / tail.length)
      : [];

  const spark = (data: ReadonlyArray<number | null | undefined>) =>
    data.length >= 2 ? (
      <Sparkline data={data} width={SPARK_WIDTH} height={SPARK_HEIGHT} ariaLabel="Recent trend" />
    ) : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <MetricCard
        label="Active bots"
        value={`${(latest?.activeBots ?? 0).toLocaleString()} / ${run.botCount.toLocaleString()}`}
        info="Synthetic users currently exercising your target. The denominator is the bot count you configured."
        sparkline={spark(activeBotsSeries)}
      />
      <MetricCard
        label="Current RPS"
        value={latest?.rps != null ? latest.rps.toFixed(0) : '—'}
        info="Requests per second across all bots in the most recent 10-second window. Reflects real Playwright network traffic."
        sparkline={spark(rpsSeries)}
      />
      <MetricCard
        label="Error rate"
        value={latest?.errorRate != null ? `${(latest.errorRate * 100).toFixed(2)}%` : '—'}
        info="Share of HTTP responses with status ≥ 400 in the most recent window. 5xx responses contribute to integration_bug findings."
        sparkline={spark(errorSeries)}
      />
      <MetricCard
        label="p50 latency"
        value={latest?.p50Ms != null ? `${latest.p50Ms.toFixed(0)} ms` : '—'}
        info="Median response time over the recent window. The middle 50% of requests come back faster than this."
        sparkline={spark(p50Series)}
      />
      <MetricCard
        label="p95 latency"
        value={latest?.p95Ms != null ? `${latest.p95Ms.toFixed(0)} ms` : '—'}
        info="95th-percentile response time. Latencies above 3000ms surface as latency_cascade findings."
        sparkline={spark(p95Series)}
      />
      <MetricCard
        label={isCompleted ? 'Cost' : 'Cost (live)'}
        value={`$${(liveCostCents / 100).toFixed(2)}`}
        info={
          run.hardCapCents
            ? `Live projection from elapsed × estimated rate. Hard cap: $${(run.hardCapCents / 100).toFixed(2)}; we'll auto-pause near the cap. Final value lands in this card on completion.`
            : 'Live projection from elapsed × estimated rate. Final value lands here on completion.'
        }
        hint={
          run.hardCapCents
            ? `${(burnPct * 100).toFixed(0)}% of cap`
            : run.costCentsEstimated
              ? `est. $${(run.costCentsEstimated / 100).toFixed(2)} total`
              : undefined
        }
        sparkline={spark(costSeries)}
        tone={costTone}
      />
    </div>
  );
}
