import { cn } from '@/lib/utils';
import { Info, TrendingDown, TrendingUp } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import type { ReactNode } from 'react';

export function MetricCard({
  label,
  value,
  hint,
  delta,
  info,
  positiveIsGood = true,
  className,
  sparkline,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: string;
  /** When set, renders a small info icon next to the label with a tooltip
   *  explaining what this metric means. Plain text only — keep it short. */
  info?: string;
  positiveIsGood?: boolean;
  className?: string;
  /** Optional inline visualization rendered to the right of the value
   *  (e.g. a Sparkline component). The card grows the value row to fit. */
  sparkline?: ReactNode;
  /** Visual emphasis. 'warn' adds a soft amber border (e.g. cost over 80% cap). */
  tone?: 'default' | 'warn' | 'danger';
}) {
  const good =
    delta && delta.startsWith('+')
      ? positiveIsGood
      : delta?.startsWith('-')
        ? !positiveIsGood
        : undefined;

  return (
    <div
      className={cn(
        'rounded-xl border bg-gradient-to-b from-ob-surface to-ob-bg p-5',
        tone === 'warn'
          ? 'border-ob-warn/40 shadow-[0_0_20px_-12px_rgba(244,184,96,0.4)]'
          : tone === 'danger'
            ? 'border-ob-danger/40 shadow-[0_0_20px_-12px_rgba(226,116,116,0.45)]'
            : 'border-ob-line',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-ob-dim">
          {label}
        </p>
        {info && (
          <Tooltip content={info} side="top">
            <button
              type="button"
              aria-label={`About ${label}`}
              className="text-ob-dim/70 transition-colors hover:text-ob-signal focus:text-ob-signal focus:outline-none"
            >
              <Info className="h-3 w-3" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-mono text-2xl font-semibold tabular-nums text-ob-ink">{value}</p>
        {sparkline && <div className="shrink-0 text-ob-signal/80">{sparkline}</div>}
      </div>
      {hint && <p className="mt-1 text-xs text-ob-muted">{hint}</p>}
      {delta && (
        <p
          className={cn(
            'mt-2 inline-flex items-center gap-1 font-mono text-xs',
            good === true && 'text-ob-signal',
            good === false && 'text-ob-danger',
            good === undefined && 'text-ob-muted',
          )}
        >
          {good === true && <TrendingUp className="h-3.5 w-3.5" />}
          {good === false && <TrendingDown className="h-3.5 w-3.5" />}
          {delta}
        </p>
      )}
    </div>
  );
}

export function StatusDot({ status }: { status: 'ok' | 'warn' | 'bad' }) {
  const cls =
    status === 'ok'
      ? 'bg-ob-signal shadow-[0_0_8px_rgba(124,240,192,0.5)]'
      : status === 'warn'
        ? 'bg-ob-warn'
        : 'bg-ob-danger';
  return <span className={cn('inline-block h-2 w-2 rounded-full', cls)} aria-hidden />;
}
