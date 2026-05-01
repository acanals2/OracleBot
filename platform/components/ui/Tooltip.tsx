'use client';

/**
 * Lightweight CSS-only tooltip. No deps. Accessible: tooltip content is
 * exposed via aria-describedby and toggles on hover/focus.
 *
 * Intentionally simple — for richer behavior (collisions, smart positioning,
 * portals) swap for Radix UI's @radix-ui/react-tooltip in a follow-up.
 *
 *   <Tooltip content="Explainer text...">
 *     <SomeTrigger />
 *   </Tooltip>
 */
import { useId, useState, type ReactNode } from 'react';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const sideClasses: Record<TooltipSide, string> = {
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
    left: 'right-full top-1/2 mr-2 -translate-y-1/2',
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
  };

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute z-50 max-w-[260px] rounded-md border border-ob-line bg-ob-bg px-2.5 py-1.5 text-xs leading-relaxed text-ob-ink shadow-lg ${sideClasses[side]}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
