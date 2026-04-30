import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ob-signal disabled:pointer-events-none disabled:opacity-45',
          {
            primary:
              'bg-ob-signal text-ob-bg shadow-glow hover:bg-white hover:shadow-[0_0_32px_-4px_rgba(124,240,192,0.35)]',
            secondary:
              'bg-ob-panel text-ob-ink ring-1 ring-ob-line-strong hover:bg-ob-raised hover:ring-ob-muted/30',
            ghost: 'text-ob-muted hover:bg-ob-surface hover:text-ob-ink',
            danger: 'bg-red-950/50 text-red-200 ring-1 ring-red-500/30 hover:bg-red-950',
          }[variant],
          {
            sm: 'h-8 py-1.5 px-3 text-xs',
            md: 'py-2.5 px-4 text-sm',
            lg: 'py-3 px-6 text-base',
          }[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
