'use client';

/**
 * Compact live findings panel for the Run Console sidebar. Shows severity
 * counters, top categories, and the latest finding (with click to expand
 * description). Mirrors the aesthetic of RunSummaryCard from the results
 * page so users see continuity from "in flight" to "completed".
 *
 * The full per-finding list lives on the results page (FindingsList);
 * this panel is intentionally summary-only so it doesn't grow without
 * bound during a multi-finding run.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useLiveRun } from './LiveRunProvider';
import type { RunFinding } from '@/lib/db/schema';

const TERMINAL = new Set(['completed', 'failed', 'canceled', 'timed_out']);

type Severity = RunFinding['severity'];
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_PILL: Record<Severity, string> = {
  critical: 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger',
  high: 'border-ob-warn/40 bg-ob-warn/10 text-ob-warn',
  medium: 'border-ob-line bg-ob-surface text-ob-ink',
  low: 'border-ob-line bg-ob-surface/60 text-ob-muted',
  info: 'border-ob-line/40 bg-ob-bg/40 text-ob-dim',
};

export function LiveFindingsPanel() {
  const { findings, run, status } = useLiveRun();
  const [expandLatest, setExpandLatest] = useState(false);
  const isTerminal = TERMINAL.has(status);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const f of findings) c[f.severity] += 1;
    return c;
  }, [findings]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of findings) map.set(f.category, (map.get(f.category) ?? 0) + 1);
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [findings]);

  const latest = findings.length > 0 ? findings[findings.length - 1] : null;

  // Live readiness preview — same formula as worker/src/engine/scoring.ts
  // (see C.18 for the eventual move to server-side authoritative compute).
  const readinessPreview = computeReadinessPreview(findings);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Findings</CardTitle>
          <span
            className={`font-mono text-[10px] uppercase tracking-widest ${readinessTone(readinessPreview)}`}
          >
            {isTerminal && run.readinessScore != null
              ? `${run.readinessScore} / 100`
              : `${readinessPreview} / 100 preview`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {findings.length === 0 ? (
          <p className="text-sm text-ob-muted">
            {isTerminal
              ? 'No findings recorded for this run.'
              : 'No findings yet — bots will surface issues here in real time.'}
          </p>
        ) : (
          <>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">
                By severity
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SEVERITY_ORDER.map((sev) => {
                  const n = counts[sev];
                  if (n === 0) return null;
                  return (
                    <span
                      key={sev}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${SEVERITY_PILL[sev]}`}
                    >
                      <span className="tabular-nums">{n}</span>
                      <span>{sev}</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {topCategories.length > 0 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">
                  Top categories
                </p>
                <ul className="mt-2 space-y-1">
                  {topCategories.map(([cat, n]) => (
                    <li
                      key={cat}
                      className="flex items-center justify-between gap-2 font-mono text-xs"
                    >
                      <span className="truncate text-ob-ink">{cat}</span>
                      <span className="tabular-nums text-ob-muted">×{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {latest && (
              <div className="rounded-lg border border-ob-line bg-ob-bg/40 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">
                  Latest finding
                </p>
                <button
                  type="button"
                  onClick={() => setExpandLatest((v) => !v)}
                  className="mt-1.5 flex w-full items-start justify-between gap-2 text-left"
                  aria-expanded={expandLatest}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-ob-muted">
                      {latest.severity} · {latest.category}
                    </p>
                    <p className="mt-1 truncate text-sm text-ob-ink">{latest.title}</p>
                  </div>
                  {expandLatest ? (
                    <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-ob-muted" />
                  ) : (
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ob-muted" />
                  )}
                </button>
                {expandLatest && (
                  <p className="mt-2 text-xs leading-relaxed text-ob-muted">{latest.description}</p>
                )}
              </div>
            )}
          </>
        )}

        {isTerminal && (
          <Link
            href={`/app/tests/${run.id}/results`}
            className="inline-flex items-center gap-1 font-mono text-xs text-ob-signal hover:underline"
          >
            View full report <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Mirror of worker/src/engine/scoring.ts for live preview. Final score is
 * authoritative from the worker on completion; this preview lets users
 * watch the readiness number drop as findings stream in.
 *
 *   start at 100
 *   subtract: critical -25, high -12, medium -6, low -2, info -0.5
 *   if any critical: extra -5
 *   floor at 0, round
 */
function computeReadinessPreview(findings: ReadonlyArray<RunFinding>): number {
  let score = 100;
  let hasCritical = false;
  for (const f of findings) {
    switch (f.severity) {
      case 'critical':
        score -= 25;
        hasCritical = true;
        break;
      case 'high':
        score -= 12;
        break;
      case 'medium':
        score -= 6;
        break;
      case 'low':
        score -= 2;
        break;
      case 'info':
        score -= 0.5;
        break;
    }
  }
  if (hasCritical) score -= 5;
  return Math.max(0, Math.round(score));
}

function readinessTone(score: number): string {
  if (score >= 90) return 'text-ob-signal';
  if (score >= 70) return 'text-ob-warn';
  return 'text-ob-danger';
}
