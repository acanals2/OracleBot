'use client';

/**
 * Live time-series chart for a run's metrics. Renders p95 latency as an
 * area chart and RPS as a stroked line on a shared time axis.
 *
 * Reads from useLiveRun() so it updates incrementally as SSE messages
 * deliver new RunMetric rows. The backing data is the same `metrics` array
 * the metric cards consume — no separate fetch.
 */
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
  t: number; // tSeconds
  label: string; // formatted axis label
  p95: number | null;
  rps: number | null;
  errorRate: number | null;
  activeBots: number | null;
}

export function MetricsTimeline() {
  const { metrics, run, isLive } = useLiveRun();

  const data: ChartPoint[] = metrics.map((m) => ({
    t: m.tSeconds,
    label: formatT(m.tSeconds),
    p95: m.p95Ms,
    rps: m.rps,
    errorRate: m.errorRate,
    activeBots: m.activeBots,
  }));

  const subtitle = isLive
    ? `Live · ${data.length} sample${data.length === 1 ? '' : 's'} · ${run.durationMinutes}-minute run`
    : `${data.length} sample${data.length === 1 ? '' : 's'} · ${run.durationMinutes}-minute run`;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Latency &amp; throughput</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">
            p95 area · RPS line
          </span>
        </CardTitle>
        <p className="text-xs text-ob-muted">{subtitle}</p>
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
                  if (name === 'p95') return [`${(value as number).toFixed(0)} ms`, 'p95'];
                  if (name === 'rps') return [`${(value as number).toFixed(1)}`, 'RPS'];
                  return [value, name];
                }}
                labelFormatter={(label) => `t=${label}`}
              />
              <Area
                yAxisId="ms"
                type="monotone"
                dataKey="p95"
                name="p95"
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

function formatT(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, '0')}s`;
}
