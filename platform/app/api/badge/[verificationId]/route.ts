/**
 * Public readiness badge — SVG endpoint (Phase 14).
 *
 *   GET /api/badge/<verificationId>      → image/svg+xml
 *
 * Anti-gaming + freshness rules live in `lib/badge.ts`. This route is
 * deliberately thin: resolve, render, return. Cached at the edge for one
 * hour so popular badges hit the database rarely.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  colorForScore,
  displayFor,
  resolveBadge,
  type BadgeColor,
} from '@/lib/badge';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ verificationId: string }> },
) {
  const { verificationId: rawId } = await params;
  // Strip ".svg" suffix if the caller used /badge/<id>.svg.
  const verificationId = rawId.replace(/\.svg$/i, '');

  if (!UUID_RE.test(verificationId)) {
    return new NextResponse(svgError('invalid id'), {
      status: 400,
      headers: svgHeaders({ cacheable: false }),
    });
  }

  try {
    const state = await resolveBadge(verificationId);
    const display = displayFor(state);
    const svg = renderBadgeSvg({ rightText: display.rightText, color: display.color });
    return new NextResponse(svg, {
      status: 200,
      headers: svgHeaders({ cacheable: state.kind === 'fresh' }),
    });
  } catch (err) {
    // Never leak internal errors into a publicly cached badge.
    console.error('[badge] resolve failed', err);
    return new NextResponse(svgError('error'), {
      status: 500,
      headers: svgHeaders({ cacheable: false }),
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SVG rendering — shields.io-compatible flat-square layout
// ────────────────────────────────────────────────────────────────────────────

const COLOR_HEX: Record<BadgeColor, string> = {
  green: '#3fb950',
  yellow: '#d29922',
  red: '#f85149',
  gray: '#8b949e',
};

const LEFT_LABEL = 'oraclebot';

/**
 * Render a flat-square readiness badge. Width is computed from text length
 * using a coarse 7px-per-character approximation that matches shields.io's
 * default Verdana/Helvetica metrics closely enough for monospace-y readouts
 * like "92" or "stale". A more exact text-measurement step is unnecessary
 * for this use case.
 */
function renderBadgeSvg({
  rightText,
  color,
}: {
  rightText: string;
  color: BadgeColor;
}): string {
  const leftWidth = textWidth(LEFT_LABEL) + 12;
  const rightWidth = textWidth(rightText) + 12;
  const totalWidth = leftWidth + rightWidth;
  const fill = COLOR_HEX[color];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${LEFT_LABEL}: ${escapeXml(rightText)}">
  <title>${LEFT_LABEL}: ${escapeXml(rightText)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#555"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${fill}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${leftWidth / 2}" y="14">${LEFT_LABEL}</text>
    <text x="${leftWidth + rightWidth / 2}" y="14">${escapeXml(rightText)}</text>
  </g>
</svg>`;
}

/** Approximate pixel width of a string at 11px Verdana. Good enough for a flat badge. */
function textWidth(s: string): number {
  // Different glyph classes have different average widths; this matches
  // shields.io's coarse heuristic well enough for typical scores + status words.
  let w = 0;
  for (const ch of s) {
    if (/[ijl|.,:;!]/.test(ch)) w += 3;
    else if (/[A-Z]/.test(ch)) w += 8;
    else if (/[0-9]/.test(ch)) w += 7;
    else w += 6;
  }
  return w;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function svgError(message: string): string {
  return renderBadgeSvg({ rightText: message, color: 'gray' });
}

function svgHeaders({ cacheable }: { cacheable: boolean }): HeadersInit {
  return {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    // 1-hour CDN cache for healthy badges; no cache for error / pending states
    // so users see updates immediately after re-running or fixing verification.
    'Cache-Control': cacheable
      ? 'public, max-age=3600, stale-while-revalidate=86400'
      : 'no-cache, no-store, must-revalidate',
    // Discourage clients from sniffing — this is always SVG.
    'X-Content-Type-Options': 'nosniff',
  };
}

// Internal symbol export so the route file participates in tree-shake but the
// helper colorForScore is referenced via lib/badge.ts. Keep here to silence
// "unused import" if a future refactor inlines the color util.
void colorForScore;
