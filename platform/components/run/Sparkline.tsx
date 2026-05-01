/**
 * Inline SVG sparkline for KPI cards. No recharts overhead — we render up
 * to ~30 of these on the run console at once, so a hand-rolled SVG is the
 * right tool. Pure server-renderable; no useState / useEffect.
 *
 *   <Sparkline data={metrics.map(m => m.p95Ms)} stroke="#7CF0C0" />
 *
 * - Auto-scales Y to the data's [min, max] with a small padding
 * - Draws a polyline + soft gradient area fill
 * - Optional last-point dot for "you are here" emphasis
 * - Renders empty (transparent) when fewer than 2 valid samples
 */

interface SparklineProps {
  /** Series values; null/undefined entries are skipped. */
  data: ReadonlyArray<number | null | undefined>;
  width?: number;
  height?: number;
  /** Stroke colour (defaults to `currentColor`, lets the parent control it via text-ob-signal etc.). */
  stroke?: string;
  /** Whether to draw the trailing dot. Defaults to true. */
  dot?: boolean;
  /** Whether to fill under the line. Defaults to true. */
  fill?: boolean;
  /** Accessible label for screen readers. */
  ariaLabel?: string;
  className?: string;
}

export function Sparkline({
  data,
  width = 96,
  height = 28,
  stroke,
  dot = true,
  fill = true,
  ariaLabel,
  className,
}: SparklineProps) {
  // Filter to numeric points and remember their original index so the X
  // axis stays evenly spaced relative to the source series.
  const points: { i: number; v: number }[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i];
    if (typeof v === 'number' && Number.isFinite(v)) points.push({ i, v });
  }

  if (points.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel ?? 'No data'}
        className={className}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeDasharray="2 4"
        />
      </svg>
    );
  }

  const minV = Math.min(...points.map((p) => p.v));
  const maxV = Math.max(...points.map((p) => p.v));
  const range = maxV - minV || 1; // avoid divide-by-zero on flat series
  const padY = 2;

  const xFor = (idx: number) =>
    points.length === 1 ? width / 2 : (idx / (points.length - 1)) * width;
  const yFor = (v: number) => padY + (1 - (v - minV) / range) * (height - padY * 2);

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xFor(idx).toFixed(2)} ${yFor(p.v).toFixed(2)}`)
    .join(' ');

  const areaPath = `${linePath} L ${xFor(points.length - 1).toFixed(2)} ${height} L 0 ${height} Z`;

  const last = points[points.length - 1];

  // Stable id so multiple sparklines on the same page don't collide.
  const gradId = `sparkGrad-${(stroke ?? 'cur').replace(/[^a-z0-9]/gi, '')}-${data.length}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel ?? `Trend across ${points.length} samples`}
      className={className}
      style={stroke ? { color: stroke } : undefined}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.28} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot && (
        <circle
          cx={xFor(points.length - 1)}
          cy={yFor(last.v)}
          r={1.75}
          fill="currentColor"
        />
      )}
    </svg>
  );
}
