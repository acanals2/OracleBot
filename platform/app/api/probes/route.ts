/**
 * GET /api/probes  — public probe manifest.
 *
 * Returns the same metadata that powers /probes.html on the marketing
 * site. No auth required; this is intended to be the canonical way to
 * discover the probe catalogue from CI scripts, third-party tooling,
 * or product comparisons.
 *
 * Includes ETag based on a manifest version + probe count so clients
 * can cache cheaply. Edge-cached for 5 minutes.
 */
import { NextResponse } from 'next/server';
import { PROBE_MANIFEST } from '@/data/probe-manifest';

export const dynamic = 'force-static';

const totalProbes = PROBE_MANIFEST.packs.reduce((n, p) => n + p.probes.length, 0);
const ETAG = `"v${PROBE_MANIFEST.version}-${totalProbes}"`;

export async function GET(req: Request) {
  // Cheap conditional GET — saves bandwidth on heartbeat polling.
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch === ETAG) {
    return new NextResponse(null, { status: 304 });
  }

  return NextResponse.json(
    {
      version: PROBE_MANIFEST.version,
      totalProbes,
      shippedPacks: PROBE_MANIFEST.packs.filter((p) => p.shipped).length,
      packs: PROBE_MANIFEST.packs.map((p) => ({
        id: p.id,
        label: p.label,
        tagline: p.tagline,
        description: p.description,
        audience: p.audience,
        shipped: p.shipped,
        probeCount: p.probes.length,
        probes: p.probes.map((pr) => ({
          id: pr.id,
          title: pr.title,
          severity: pr.severity,
          description: pr.description,
        })),
      })),
    },
    {
      headers: {
        ETag: ETAG,
        // 5 min CDN, 1h stale-while-revalidate. Manifest changes maybe
        // weekly; this is comfortably fresh.
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    },
  );
}
