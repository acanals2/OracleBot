'use client';

/**
 * Read-only card showing the configured parameters of a run: target,
 * mode/bots/duration, hard cap, estimated cost, intent mix, persona
 * mix, scenarios. Lives in the Run Console sidebar so the user can
 * always see what was configured without leaving the live page.
 *
 * Renders 'use client' for the copy-target affordance (clipboard).
 * Everything else is static during the run.
 */
import { Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useLiveRun } from './LiveRunProvider';

const INTENT_COLORS: Record<string, string> = {
  friendly: 'bg-ob-signal/60',
  adversarial: 'bg-ob-warn/70',
  confused: 'bg-ob-muted/60',
  hostile: 'bg-ob-danger/60',
};

export function RunConfigCard() {
  const { run } = useLiveRun();
  const toast = useToast();

  const targetUrl =
    run.targetLiveUrl ?? run.targetAgentEndpoint ?? run.targetRepoUrl ?? run.targetDockerImage;

  const copy = (text: string, label: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.show(`${label} copied`))
      .catch(() => toast.show(`Failed to copy ${label}`, { kind: 'error' }));

  const intentBars = run.intentMix ? buildIntentBars(run.intentMix) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {targetUrl && (
          <Field
            label="Target"
            value={
              <button
                type="button"
                onClick={() => copy(targetUrl, 'Target')}
                className="inline-flex max-w-full items-center gap-1.5 truncate font-mono text-xs text-ob-ink transition-colors hover:text-ob-signal"
                title={targetUrl}
              >
                <span className="truncate">{targetUrl}</span>
                <Copy className="h-3 w-3 shrink-0" />
              </button>
            }
          />
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label="Mode" value={<span className="font-mono text-xs">{run.mode}</span>} />
          <Field
            label="Bots"
            value={<span className="font-mono text-xs tabular-nums">{run.botCount.toLocaleString()}</span>}
          />
          <Field
            label="Duration"
            value={<span className="font-mono text-xs">{run.durationMinutes}m</span>}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Estimated cost"
            value={
              <span className="font-mono text-xs">
                {run.costCentsEstimated != null ? `$${(run.costCentsEstimated / 100).toFixed(2)}` : '—'}
              </span>
            }
          />
          <Field
            label="Hard cap"
            value={
              <span className="font-mono text-xs">
                {run.hardCapCents != null ? `$${(run.hardCapCents / 100).toFixed(2)}` : '—'}
              </span>
            }
            hint={run.hardCapCents != null ? 'auto-pauses near cap' : undefined}
          />
        </div>

        {intentBars && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">
              Intent mix
            </p>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-ob-line/30">
              {intentBars.map(({ key, pct }) => (
                <div
                  key={key}
                  className={INTENT_COLORS[key] ?? 'bg-ob-muted/40'}
                  style={{ width: `${pct}%` }}
                  title={`${key} ${pct.toFixed(0)}%`}
                />
              ))}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[10px] text-ob-muted">
              {intentBars.map(({ key, pct }) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 rounded-sm ${INTENT_COLORS[key] ?? 'bg-ob-muted/40'}`}
                    aria-hidden
                  />
                  <span className="capitalize">{key}</span>
                  <span className="ml-auto tabular-nums">{pct.toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {run.personaMix && run.personaMix.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">
              Top personas
            </p>
            <ul className="mt-2 space-y-0.5 font-mono text-xs">
              {[...run.personaMix]
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 5)
                .map((p) => (
                  <li key={p.archetype} className="flex justify-between gap-2 text-ob-muted">
                    <span className="truncate text-ob-ink">{p.archetype}</span>
                    <span className="tabular-nums">{(p.weight * 100).toFixed(0)}%</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {run.scenarioIds && run.scenarioIds.length > 0 && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">
              Scenarios
            </p>
            <ul className="mt-2 flex flex-wrap gap-1">
              {run.scenarioIds.map((id) => (
                <li
                  key={id}
                  className="rounded-md border border-ob-line bg-ob-bg/40 px-2 py-0.5 font-mono text-[10px] text-ob-muted"
                >
                  {id}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">{label}</p>
      <div className="mt-1">{value}</div>
      {hint && <p className="mt-0.5 text-[10px] text-ob-muted">{hint}</p>}
    </div>
  );
}

function buildIntentBars(intentMix: Record<string, number | undefined>): Array<{
  key: string;
  pct: number;
}> {
  const entries = Object.entries(intentMix).filter(([, v]) => typeof v === 'number') as Array<
    [string, number]
  >;
  if (entries.length === 0) return [];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return [];
  return entries
    .map(([key, v]) => ({ key, pct: (v / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}
