/**
 * Server-side render of the run summary: target URL, mode, severity
 * breakdown, readiness score breakdown. Replaces the raw JSON dump that
 * previously rendered run.summaryJson.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { Run, RunFinding } from '@/lib/db/schema';

type Severity = RunFinding['severity'];

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_PILL: Record<Severity, string> = {
  critical: 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger',
  high: 'border-ob-warn/40 bg-ob-warn/10 text-ob-warn',
  medium: 'border-ob-line bg-ob-surface text-ob-ink',
  low: 'border-ob-line bg-ob-surface/60 text-ob-muted',
  info: 'border-ob-line/40 bg-ob-bg/40 text-ob-dim',
};

// Donut colours map to the same Tailwind tokens our pills use, but we
// need raw hex values for inline SVG strokes — Tailwind classes don't
// reach into SVG.
const SEVERITY_HEX: Record<Severity, string> = {
  critical: '#E27474',
  high: '#F4B860',
  medium: '#5fb7ff',
  low: '#9097A4',
  info: '#5F6573',
};

function SeverityDonut({ counts }: { counts: Record<Severity, number> }) {
  const total = SEVERITY_ORDER.reduce((n, s) => n + counts[s], 0);
  if (total === 0) return null;

  // Inline SVG donut: r=42, circumference≈263.9. Each slice is a
  // dasharray segment; offsets accumulate so segments don't overlap.
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segments = SEVERITY_ORDER.map((sev) => {
    const n = counts[sev];
    if (n === 0) return null;
    const len = (n / total) * c;
    const segment = (
      <circle
        key={sev}
        cx={60}
        cy={60}
        r={r}
        fill="transparent"
        stroke={SEVERITY_HEX[sev]}
        strokeWidth={14}
        strokeDasharray={`${len.toFixed(2)} ${(c - len).toFixed(2)}`}
        strokeDashoffset={(-offset).toFixed(2)}
        transform="rotate(-90 60 60)"
      >
        <title>{`${n} ${sev}`}</title>
      </circle>
    );
    offset += len;
    return segment;
  }).filter((s): s is JSX.Element => s !== null);

  return (
    <svg
      viewBox="0 0 120 120"
      width={96}
      height={96}
      className="shrink-0"
      role="img"
      aria-label={`Severity distribution donut: ${SEVERITY_ORDER.filter((s) => counts[s] > 0)
        .map((s) => `${counts[s]} ${s}`)
        .join(', ')}`}
    >
      {/* Track */}
      <circle cx={60} cy={60} r={r} fill="transparent" stroke="#1c2027" strokeWidth={14} />
      {segments}
      {/* Centre label = total */}
      <text
        x={60}
        y={62}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="22"
        fontFamily="JetBrains Mono, ui-monospace, monospace"
        fontWeight="500"
        fill="#ECEEF2"
      >
        {total}
      </text>
      <text
        x={60}
        y={82}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="8"
        fontFamily="JetBrains Mono, ui-monospace, monospace"
        letterSpacing="0.16em"
        fill="#5F6573"
      >
        TOTAL
      </text>
    </svg>
  );
}

export function RunSummaryCard({ run, findings }: { run: Run; findings: RunFinding[] }) {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }

  const targetUrl =
    run.targetLiveUrl ?? run.targetAgentEndpoint ?? run.targetRepoUrl ?? run.targetDockerImage;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Summary</span>
          {run.readinessScore != null && (
            <span
              className={`font-mono text-[11px] uppercase tracking-widest ${
                run.readinessScore >= 90
                  ? 'text-ob-signal'
                  : run.readinessScore >= 70
                    ? 'text-ob-warn'
                    : 'text-ob-danger'
              }`}
            >
              {run.readinessScore}/100 readiness
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {targetUrl && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">Target</p>
            <p className="mt-1 break-all font-mono text-sm text-ob-ink">{targetUrl}</p>
          </div>
        )}

        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">
            Findings by severity
          </p>
          {findings.length === 0 ? (
            <p className="mt-2 text-sm text-ob-muted">
              No findings recorded. Either the target is healthy or the bots didn&apos;t exercise
              a code path that would surface one.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <SeverityDonut counts={counts} />
              <div className="flex flex-1 flex-wrap gap-2">
                {SEVERITY_ORDER.map((sev) => {
                  const n = counts[sev];
                  if (n === 0) return null;
                  return (
                    <span
                      key={sev}
                      className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${SEVERITY_PILL[sev]}`}
                    >
                      <span className="text-base font-semibold tabular-nums">{n}</span>
                      <span>{sev}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">Mode</p>
            <p className="mt-1 font-mono text-sm text-ob-ink">{run.mode}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">Bots</p>
            <p className="mt-1 font-mono text-sm text-ob-ink">{run.botCount.toLocaleString()}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">Duration</p>
            <p className="mt-1 font-mono text-sm text-ob-ink">{run.durationMinutes} min</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
