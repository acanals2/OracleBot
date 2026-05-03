/**
 * Inline SVG sparkline of completed-run readiness scores over the last 14
 * days. Pure server component, no client JS.
 *
 * Each point is a real run; tooltip-on-hover via native <title>. We keep
 * Y axis pinned to 0–100 so visual height directly maps to score.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

interface Point {
  runId: string;
  completedAt: string;
  score: number;
  mode: string;
}

const W = 720;
const H = 120;
const PAD_X = 24;
const PAD_Y = 16;

export function ScoreOverTime({ series }: { series: Point[] }) {
  if (series.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Readiness over time</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ob-muted">
            No completed runs in the last 14 days. Recent scores will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  // X = chronological position; Y = score (0 at bottom, 100 at top).
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const points = series.map((p, i) => {
    const x = series.length === 1 ? PAD_X + innerW / 2 : PAD_X + (i / (series.length - 1)) * innerW;
    const y = PAD_Y + innerH * (1 - p.score / 100);
    return { ...p, x, y };
  });

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  // Reference lines for 70 (yellow) and 90 (green) thresholds.
  const yAt = (score: number) => PAD_Y + innerH * (1 - score / 100);
  const latest = series[series.length - 1];

  return (
    <Card>
      <CardHeader className="flex flex-row items-baseline justify-between">
        <CardTitle>Readiness over time</CardTitle>
        <span className="font-mono text-[11px] uppercase tracking-wider text-ob-dim">
          {series.length} run{series.length === 1 ? '' : 's'} · last 14 days
        </span>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-32 w-full"
          role="img"
          aria-label={`Score over time: ${series.length} runs, latest ${latest.score}/100`}
          preserveAspectRatio="none"
        >
          {/* Reference grid */}
          <line x1={PAD_X} x2={W - PAD_X} y1={yAt(70)} y2={yAt(70)} stroke="#1c2027" strokeDasharray="2 4" />
          <line x1={PAD_X} x2={W - PAD_X} y1={yAt(90)} y2={yAt(90)} stroke="#1c2027" strokeDasharray="2 4" />
          <text x={W - PAD_X + 4} y={yAt(70)} fill="#5F6573" fontSize="9" fontFamily="JetBrains Mono, monospace" alignmentBaseline="middle">70</text>
          <text x={W - PAD_X + 4} y={yAt(90)} fill="#5F6573" fontSize="9" fontFamily="JetBrains Mono, monospace" alignmentBaseline="middle">90</text>

          {/* Path */}
          <path d={path} fill="none" stroke="#7CF0C0" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* Points */}
          {points.map((p) => (
            <circle
              key={p.runId}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={p.score >= 90 ? '#7CF0C0' : p.score >= 70 ? '#F4B860' : '#E27474'}
              stroke="#0c0d11"
              strokeWidth="1.5"
            >
              <title>{`${p.score}/100 · ${p.mode} · ${new Date(p.completedAt).toLocaleString()}`}</title>
            </circle>
          ))}
        </svg>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-wider">
          <div className="flex flex-wrap items-center gap-3 text-ob-dim">
            <span>
              Latest:{' '}
              <span className={`tabular-nums ${latest.score >= 90 ? 'text-ob-signal' : latest.score >= 70 ? 'text-ob-warn' : 'text-ob-danger'}`}>
                {latest.score}
              </span>
              /100
            </span>
            <span>
              Avg:{' '}
              <span className="tabular-nums text-ob-muted">
                {Math.round(series.reduce((s, p) => s + p.score, 0) / series.length)}
              </span>
              /100
            </span>
            <span>
              Min:{' '}
              <span className="tabular-nums text-ob-muted">
                {Math.min(...series.map((p) => p.score))}
              </span>
              /100
            </span>
            <span>
              Max:{' '}
              <span className="tabular-nums text-ob-muted">
                {Math.max(...series.map((p) => p.score))}
              </span>
              /100
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
