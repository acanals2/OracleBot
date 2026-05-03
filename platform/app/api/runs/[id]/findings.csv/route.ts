/**
 * GET /api/runs/:id/findings.csv
 *
 * Streams the run's findings as a UTF-8 CSV. Auth: same as /api/runs/:id
 * (session OR API token). Useful for piping into ticketing tools, BI dashboards,
 * or compliance evidence packs.
 *
 * Columns: severity, category, probe_id, title, description, remediation,
 * impacted_path, repro_steps_json, fix_pr_url, created_at_iso
 */
import { requireSessionOrToken } from '@/lib/api-tokens';
import { apiError } from '@/lib/api-helpers';
import { getRunWithDetails } from '@/lib/runs';
import { NextResponse } from 'next/server';

type Params = Promise<{ id: string }>;

const COLUMNS = [
  'severity',
  'category',
  'probe_id',
  'title',
  'description',
  'remediation',
  'impacted_path',
  'repro_steps_json',
  'fix_pr_url',
  'created_at_iso',
] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  // Always quote — simpler and correct for fields with newlines, commas, or
  // embedded quotes. Per RFC 4180, embedded " is escaped as "".
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const session = await requireSessionOrToken();
    const { id } = await params;
    const detail = await getRunWithDetails(session.org.id, id);
    if (!detail) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    const lines: string[] = [COLUMNS.join(',')];
    for (const f of detail.findings) {
      const repro = f.reproJson;
      const impactedPath = (repro && typeof repro === 'object' && 'impactedPath' in repro)
        ? (repro as { impactedPath?: unknown }).impactedPath
        : '';
      const steps = (repro && typeof repro === 'object' && 'steps' in repro)
        ? (repro as { steps?: unknown }).steps
        : null;
      lines.push([
        csvEscape(f.severity),
        csvEscape(f.category),
        csvEscape(f.probeId ?? ''),
        csvEscape(f.title),
        csvEscape(f.description),
        csvEscape(f.remediation ?? ''),
        csvEscape(impactedPath ?? ''),
        csvEscape(steps ?? ''),
        csvEscape(f.fixPullRequestUrl ?? ''),
        csvEscape(f.createdAt instanceof Date ? f.createdAt.toISOString() : ''),
      ].join(','));
    }

    const body = lines.join('\n') + '\n';
    const filename = `oraclebot-findings-${id.slice(0, 8)}.csv`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
