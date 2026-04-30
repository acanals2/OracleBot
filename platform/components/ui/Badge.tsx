import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'signal' | 'warn' | 'muted';

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider',
        {
          default: 'bg-ob-panel text-ob-muted ring-1 ring-ob-line',
          signal: 'bg-ob-signal/15 text-ob-signal ring-1 ring-ob-signal/35',
          warn: 'bg-ob-warn/10 text-ob-warn ring-1 ring-ob-warn/25',
          muted: 'bg-ob-bg text-ob-dim',
        }[variant],
        className
      )}
      {...props}
    />
  );
}
