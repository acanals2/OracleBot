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
            <div className="mt-2 flex flex-wrap gap-2">
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
