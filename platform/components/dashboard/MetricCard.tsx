import { cn } from '@/lib/utils';
import { TrendingDown, TrendingUp } from 'lucide-react';

export function MetricCard({
  label,
  value,
  hint,
  delta,
  positiveIsGood = true,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: string;
  positiveIsGood?: boolean;
  className?: string;
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
        'rounded-xl border border-ob-line bg-gradient-to-b from-ob-surface to-ob-bg p-5',
        className
      )}
    >
      <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-ob-dim">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-ob-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ob-muted">{hint}</p>}
      {delta && (
        <p
          className={cn(
            'mt-2 inline-flex items-center gap-1 font-mono text-xs',
            good === true && 'text-ob-signal',
            good === false && 'text-ob-danger',
            good === undefined && 'text-ob-muted'
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
