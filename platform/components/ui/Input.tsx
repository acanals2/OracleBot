import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-ob-line bg-ob-bg px-3 py-2 font-sans text-sm text-ob-ink placeholder:text-ob-dim',
        'ring-ob-signal/0 transition-[box-shadow,border-color] focus:border-ob-signal/50 focus:outline-none focus:ring-2 focus:ring-ob-glow',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
