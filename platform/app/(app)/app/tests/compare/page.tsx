/**
 * Run comparison view — `/app/tests/compare?a=<runId>&b=<runId>`.
 *
 * Picks two completed runs from the org and renders:
 *  - Score delta
 *  - Total finding-count delta
 *  - New (regressions: in B not in A) — keyed by probeId+title
 *  - Fixed (in A not in B)
 *  - Persistent (in both)
 *
 * Diffing is simplistic on purpose — matches by probeId when present,
 * falls back to title hash. Real customers re-run against the same
 * target with the same packs, so probeId match is the common case.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ArrowLeftRight } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { getRunWithDetails } from '@/lib/runs';
import type { RunFinding } from '@/lib/db/schema';

type SearchParams = Promise<{ a?: string; b?: string }>;

interface MatchKey { key: string; title: string; severity: RunFinding['severity']; probeId: string | null }

function keyFor(f: RunFinding): MatchKey {
  // Prefer probeId — but several legacy runs lack it, so fall back to
  // category+title which is stable across re-runs of the same probe.
  const key = f.probeId ? `p:${f.probeId}` : `t:${f.category}::${f.title.toLowerCase()}`;
  return { key, title: f.title, severity: f.severity, probeId: f.probeId ?? null };
}

const SEV_RANK: Record<RunFinding['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function scoreColor(s: number | null): string {
  if (s == null) return 'text-ob-muted';
  if (s >= 90) return 'text-ob-signal';
  if (s >= 70) return 'text-ob-warn';
  return 'text-ob-danger';
}

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const { a, b } = await searchParams;
  if (!a || !b) {
    redirect('/app/tests');
  }
  if (a === b) {
    redirect(`/app/tests/${a}/results`);
  }

  const session = await requireSession();
  const [aDetail, bDetail] = await Promise.all([
    getRunWithDetails(session.org.id, a),
    getRunWithDetails(session.org.id, b),
  ]);
  if (!aDetail || !bDetail) notFound();

  const aMap = new Map<string, MatchKey & { finding: RunFinding }>();
  for (const f of aDetail.findings) {
    const k = keyFor(f);
    if (!aMap.has(k.key)) aMap.set(k.key, { ...k, finding: f });
  }
  const bMap = new Map<string, MatchKey & { finding: RunFinding }>();
  for (const f of bDetail.findings) {
    const k = keyFor(f);
    if (!bMap.has(k.key)) bMap.set(k.key, { ...k, finding: f });
  }

  const fixed: MatchKey[] = [];
  const persistent: MatchKey[] = [];
  const regressed: MatchKey[] = [];
  for (const [key, v] of aMap) {
    if (bMap.has(key)) persistent.push(v);
    else fixed.push(v);
  }
  for (const [key, v] of bMap) {
    if (!aMap.has(key)) regressed.push(v);
  }
  fixed.sort((x, y) => SEV_RANK[x.severity] - SEV_RANK[y.severity]);
  regressed.sort((x, y) => SEV_RANK[x.severity] - SEV_RANK[y.severity]);
  persistent.sort((x, y) => SEV_RANK[x.severity] - SEV_RANK[y.severity]);

  const aScore = aDetail.run.readinessScore;
  const bScore = bDetail.run.readinessScore;
  const scoreDelta =
    aScore != null && bScore != null ? bScore - aScore : null;

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="Run comparison"
          subtitle={`${aDetail.run.name} → ${bDetail.run.name}`}
        />
        <div className="flex-1 space-y-6 p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/app/tests/${a}/results`}>
              <Button variant="ghost" size="sm">A: {a.slice(0, 8)}</Button>
            </Link>
            <ArrowLeftRight className="h-4 w-4 text-ob-dim" />
            <Link href={`/app/tests/${b}/results`}>
              <Button variant="ghost" size="sm">B: {b.slice(0, 8)}</Button>
            </Link>
            <Link href="/app/tests" className="ml-auto">
              <Button variant="ghost" size="sm">All runs</Button>
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Score change</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-3">
                  <span className={`font-mono text-2xl tabular-nums ${scoreColor(aScore)}`}>
                    {aScore ?? '—'}
                  </span>
                  <span className="text-ob-dim">→</span>
                  <span className={`font-mono text-3xl font-semibold tabular-nums ${scoreColor(bScore)}`}>
                    {bScore ?? '—'}
                  </span>
                  {scoreDelta !== null && (
                    <span
                      className={`ml-auto font-mono text-sm tabular-nums ${
                        scoreDelta > 0
                          ? 'text-ob-signal'
                          : scoreDelta < 0
                            ? 'text-ob-danger'
                            : 'text-ob-muted'
                      }`}
                    >
                      {scoreDelta > 0 ? '+' : ''}
                      {scoreDelta}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Fixed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl tabular-nums text-ob-signal">{fixed.length}</p>
                <p className="text-xs text-ob-dim">in A, gone in B</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Regressed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl tabular-nums text-ob-danger">{regressed.length}</p>
                <p className="text-xs text-ob-dim">new in B, not in A</p>
              </CardContent>
            </Card>
          </div>

          <CompareList title="Regressed" subtitle="Findings new in B" items={regressed} variant="danger" />
          <CompareList title="Fixed" subtitle="Findings present in A but resolved in B" items={fixed} variant="signal" />
          <CompareList
            title="Still failing"
            subtitle="Findings present in both runs"
            items={persistent}
            variant="muted"
          />
        </div>
      </div>
    </div>
  );
}

function CompareList({
  title,
  subtitle,
  items,
  variant,
}: {
  title: string;
  subtitle: string;
  items: MatchKey[];
  variant: 'danger' | 'signal' | 'muted';
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <span className="font-mono text-xs text-ob-dim">{items.length}</span>
        </CardTitle>
        <p className="text-xs text-ob-muted">{subtitle}</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-ob-dim">None.</p>
        ) : (
          <ul className="divide-y divide-ob-line">
            {items.map((it) => (
              <li key={it.key} className="flex items-center gap-3 py-2">
                <Badge
                  variant={
                    it.severity === 'critical' || it.severity === 'high'
                      ? 'warn'
                      : variant === 'signal'
                        ? 'signal'
                        : 'muted'
                  }
                >
                  {it.severity}
                </Badge>
                <span className="flex-1 truncate text-sm text-ob-ink">{it.title}</span>
                {it.probeId && (
                  <code className="font-mono text-[10px] text-ob-dim">{it.probeId}</code>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
