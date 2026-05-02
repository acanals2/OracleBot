'use client';

/**
 * Client-side findings panel with severity filter chips and per-finding
 * expand-to-detail. Receives the full findings array as a prop from the
 * server-rendered results page.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { RunFinding } from '@/lib/db/schema';
import { packForProbe } from '@/data/packs';

type Severity = RunFinding['severity'];

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_STYLES: Record<Severity, string> = {
  critical: 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger',
  high: 'border-ob-warn/40 bg-ob-warn/10 text-ob-warn',
  medium: 'border-ob-line bg-ob-surface text-ob-ink',
  low: 'border-ob-line bg-ob-surface/60 text-ob-muted',
  info: 'border-ob-line/40 bg-ob-bg/40 text-ob-dim',
};

const CHIP_BASE =
  'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors cursor-pointer select-none';

export function FindingsList({ findings }: { findings: RunFinding[] }) {
  const [activeSeverities, setActiveSeverities] = useState<Set<Severity>>(
    () => new Set(SEVERITY_ORDER),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) c[f.severity] += 1;
    return c;
  }, [findings]);

  const visible = useMemo(
    () => findings.filter((f) => activeSeverities.has(f.severity)),
    [findings, activeSeverities],
  );

  const toggleSeverity = (sev: Severity) => {
    setActiveSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (findings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Findings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ob-muted">
            No findings recorded. The target either passed all checks or the bots didn&apos;t
            exercise a code path that would surface one. Re-run with adversarial intent
            (settings → Intent mix → Adversarial 100%) if you want to dig deeper.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Findings ({findings.length})</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {SEVERITY_ORDER.map((sev) => {
              const n = counts[sev];
              if (n === 0) return null;
              const active = activeSeverities.has(sev);
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => toggleSeverity(sev)}
                  className={`${CHIP_BASE} ${SEVERITY_STYLES[sev]} ${
                    active ? '' : 'opacity-40 hover:opacity-70'
                  }`}
                  aria-pressed={active}
                  aria-label={`Toggle ${sev} (${n})`}
                >
                  <span className="tabular-nums">{n}</span>
                  <span>{sev}</span>
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-ob-muted">
            All severities filtered out. Click a chip above to show findings.
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((f) => (
              <FindingCard
                key={f.id}
                finding={f}
                isExpanded={expanded.has(f.id)}
                onToggle={() => toggleExpanded(f.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FindingCard({
  finding,
  isExpanded,
  onToggle,
}: {
  finding: RunFinding;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasDetails =
    finding.reproJson != null ||
    finding.fixPullRequestUrl != null ||
    finding.remediation != null;

  return (
    <li className={`rounded-xl border p-4 ${SEVERITY_STYLES[finding.severity] ?? ''}`}>
      <button
        type="button"
        onClick={hasDetails ? onToggle : undefined}
        disabled={!hasDetails}
        className="flex w-full items-start justify-between gap-2 text-left disabled:cursor-default"
        aria-expanded={hasDetails ? isExpanded : undefined}
      >
        <div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] uppercase tracking-[0.16em]">
            <span>
              {finding.severity} · {finding.category}
            </span>
            {(() => {
              const pack = packForProbe(finding.probeId);
              if (!pack) return null;
              return (
                <span
                  className="rounded-md border border-ob-line/60 bg-ob-bg/40 px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-ob-dim"
                  title={`Probe: ${finding.probeId}`}
                >
                  {pack.label}
                </span>
              );
            })()}
          </p>
          <p className="mt-2 font-display text-base text-ob-ink">{finding.title}</p>
          <p className="mt-1 text-sm text-ob-muted">{finding.description}</p>
        </div>
        {hasDetails &&
          (isExpanded ? (
            <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-ob-muted" />
          ) : (
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ob-muted" />
          ))}
      </button>

      {isExpanded && hasDetails && (
        <div className="mt-3 space-y-3">
          {finding.remediation && (
            <p className="rounded-lg border border-ob-line bg-ob-bg/40 p-3 text-xs text-ob-muted">
              <span className="font-mono uppercase tracking-wider text-ob-signal">
                Remediation:
              </span>{' '}
              {finding.remediation}
            </p>
          )}

          {finding.reproJson && <ReproDetails repro={finding.reproJson} />}

          {finding.fixPullRequestUrl && (
            <a
              href={finding.fixPullRequestUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-mono text-xs text-ob-signal hover:underline"
            >
              View AI-generated fix PR →
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function ReproDetails({
  repro,
}: {
  repro: NonNullable<RunFinding['reproJson']>;
}) {
  return (
    <div className="rounded-lg border border-ob-line bg-ob-bg/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">Reproduction</p>
      {repro.impactedPath && (
        <p className="mt-2 font-mono text-xs text-ob-ink">Path: {repro.impactedPath}</p>
      )}
      {repro.steps && repro.steps.length > 0 && (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-ob-muted">
          {repro.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
      {repro.transcript && repro.transcript.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
            Transcript
          </p>
          {repro.transcript.map((turn, i) => (
            <div key={i} className="rounded border border-ob-line/60 p-2 text-xs">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                {turn.role}
              </p>
              <p className="mt-1 text-ob-ink">{turn.content}</p>
            </div>
          ))}
        </div>
      )}
      {repro.affectedPersonas && repro.affectedPersonas.length > 0 && (
        <p className="mt-2 text-xs text-ob-muted">
          <span className="font-mono uppercase tracking-wider text-ob-dim">Personas:</span>{' '}
          {repro.affectedPersonas.join(', ')}
        </p>
      )}
    </div>
  );
}
