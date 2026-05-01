'use client';

/**
 * Live time-series chart for a run's metrics. Renders a selectable
 * percentile (p50 / p95 / p99) latency layer as an area chart, with RPS
 * overlaid as a stroked line on a shared time axis.
 *
 * Reads from useLiveRun() so points appear incrementally as SSE delivers
 * them. The percentile selector lets the user switch which latency layer
 * is the area without re-fetching.
 */
import { useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useLiveRun } from './LiveRunProvider';

type Percentile = 'p50' | 'p95' | 'p99';

const PERCENTILE_LABEL: Record<Percentile, string> = {
  p50: 'p50',
  p95: 'p95',
  p99: 'p99',
};

const tickStyle = { fill: '#5F6573', fontSize: 10 };

const tooltipStyles = {
  contentStyle: {
    background: '#14171F',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: '#9097A4', marginBottom: 4 },
  itemStyle: { color: '#7CF0C0' },
};

interface ChartPoint {
  t: number;
  label: string;
  ms: number | null;
  rps: number | null;
}

export function MetricsTimeline() {
  const { metrics, run, isLive } = useLiveRun();
  const [percentile, setPercentile] = useState<Percentile>('p95');

  const data: ChartPoint[] = metrics.map((m) => ({
    t: m.tSeconds,
    label: formatT(m.tSeconds),
    ms: percentile === 'p50' ? m.p50Ms : percentile === 'p95' ? m.p95Ms : m.p99Ms,
    rps: m.rps,
  }));

  const subtitle = isLive
    ? `Live · ${data.length} sample${data.length === 1 ? '' : 's'} · ${run.durationMinutes}-minute run`
    : `${data.length} sample${data.length === 1 ? '' : 's'} · ${run.durationMinutes}-minute run`;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Latency &amp; throughput</CardTitle>
          <PercentileToggle value={percentile} onChange={setPercentile} />
        </div>
        <p className="text-xs text-ob-muted">
          {subtitle} · {PERCENTILE_LABEL[percentile]} area · RPS line
        </p>
      </CardHeader>
      <CardContent className="h-72 pt-0">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-xs uppercase tracking-widest text-ob-dim">
              {isLive ? 'Waiting for first sample…' : 'No samples recorded'}
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="msGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7CF0C0" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#7CF0C0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="ms"
                tick={tickStyle}
                axisLine={false}
                tickLine={false}
                width={40}
                unit="ms"
              />
              <YAxis
                yAxisId="rps"
                orientation="right"
                tick={tickStyle}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                {...tooltipStyles}
                formatter={(value, name) => {
                  if (name === 'ms') return [`${(value as number).toFixed(0)} ms`, PERCENTILE_LABEL[percentile]];
                  if (name === 'rps') return [`${(value as number).toFixed(1)}`, 'RPS'];
                  return [value, name];
                }}
                labelFormatter={(label) => `t=${label}`}
              />
              <Area
                yAxisId="ms"
                type="monotone"
                dataKey="ms"
                name="ms"
                stroke="#7CF0C0"
                strokeWidth={1.5}
                fill="url(#msGrad)"
                isAnimationActive={false}
                connectNulls
              />
              <Line
                yAxisId="rps"
                type="monotone"
                dataKey="rps"
                name="rps"
                stroke="#9CC0FF"
                strokeWidth={1.25}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function PercentileToggle({
  value,
  onChange,
}: {
  value: Percentile;
  onChange: (p: Percentile) => void;
}) {
  const options: Percentile[] = ['p50', 'p95', 'p99'];
  return (
    <div
      role="tablist"
      aria-label="Latency percentile"
      className="inline-flex overflow-hidden rounded-md border border-ob-line bg-ob-bg/40 font-mono text-[10px] uppercase tracking-widest"
    >
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt)}
            className={`px-2.5 py-1 transition-colors ${
              active
                ? 'bg-ob-signal/15 text-ob-signal'
                : 'text-ob-muted hover:text-ob-ink'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function formatT(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, '0')}s`;
}
