'use client';

/**
 * Inline SVG sparkline for KPI cards. No recharts overhead — we render up
 * to ~30 of these on the run console at once, so a hand-rolled SVG is the
 * right tool. Pure server-renderable (the only client requirement is
 * useId for gradient-id uniqueness).
 *
 *   <Sparkline data={metrics.map(m => m.p95Ms)} stroke="#7CF0C0" />
 *
 * - Auto-scales Y to the data's [min, max] with vertical padding so peaks
 *   and troughs aren't clipped at the SVG edge
 * - Centers vertically when the series is flat (no range)
 * - Draws a polyline + soft gradient area fill
 * - Each instance has a unique gradient id (via useId), so multiple
 *   sparklines on the same page don't reference each other's defs
 * - Trailing dot for "you are here" emphasis
 * - Renders an empty dashed midline when fewer than 2 valid samples
 */
import { useId } from 'react';

interface SparklineProps {
  /** Series values; null/undefined entries are skipped. */
  data: ReadonlyArray<number | null | undefined>;
  width?: number;
  height?: number;
  /** Stroke colour. Defaults to currentColor (let the parent set it via text-ob-signal). */
  stroke?: string;
  /** Whether to draw the trailing dot. Defaults to true. */
  dot?: boolean;
  /** Whether to fill under the line. Defaults to true. */
  fill?: boolean;
  /** Stroke width in user units. Defaults to 1.5. */
  strokeWidth?: number;
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
  strokeWidth = 1.5,
  ariaLabel,
  className,
}: SparklineProps) {
  // Unique id per instance so gradient defs don't collide across the page.
  const gradId = `sparkGrad-${useId().replace(/[^a-z0-9]/gi, '')}`;

  // Filter to numeric points and remember their original index so the X
  // axis stays evenly spaced relative to the source series.
  const points: { i: number; v: number }[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i];
    if (typeof v === 'number' && Number.isFinite(v)) points.push({ i, v });
  }

  // Empty / single-point state — show a faint dashed midline as placeholder.
  if (points.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel ?? 'No trend data yet'}
        className={className}
        style={stroke ? { color: stroke } : undefined}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="2 4"
        />
      </svg>
    );
  }

  const minV = Math.min(...points.map((p) => p.v));
  const maxV = Math.max(...points.map((p) => p.v));
  const trueRange = maxV - minV;
  const isFlat = trueRange === 0;
  const padY = 3;

  const xFor = (idx: number) =>
    points.length === 1 ? width / 2 : (idx / (points.length - 1)) * width;

  // When the series is flat (every value identical), draw it across the
  // vertical midline so it's visible. Otherwise scale to [padY, height-padY].
  const yFor = (v: number) => {
    if (isFlat) return height / 2;
    return padY + (1 - (v - minV) / trueRange) * (height - padY * 2);
  };

  const linePath = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xFor(idx).toFixed(2)} ${yFor(p.v).toFixed(2)}`)
    .join(' ');

  const lastX = xFor(points.length - 1);
  const areaPath = `${linePath} L ${lastX.toFixed(2)} ${height} L 0 ${height} Z`;

  const last = points[points.length - 1];

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
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
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
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot && (
        <circle cx={lastX} cy={yFor(last.v)} r={2} fill="currentColor" />
      )}
    </svg>
  );
}
