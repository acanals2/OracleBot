'use client';

/**
 * Minimal toast primitive for short, transient feedback messages
 * (e.g. "Copied to clipboard"). Stack bottom-right, auto-dismiss after
 * a configurable timeout. No new dependency.
 *
 *   const toast = useToast();
 *   toast.show('Copied to clipboard');
 *   toast.show('Failed to share', { kind: 'error', timeoutMs: 4000 });
 *
 * Wrap the page (or any subtree that needs toasts) in <ToastProvider>.
 * Toast use is intentionally limited to acknowledgements and explicit
 * user-initiated feedback. Errors that require attention should surface
 * inline or through RunErrorBoundary, not as ephemeral toasts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, AlertTriangle, Info } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  show: (message: string, opts?: { kind?: ToastKind; timeoutMs?: number }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const show = useCallback(
    (message: string, opts: { kind?: ToastKind; timeoutMs?: number } = {}) => {
      const id = `t${++counterRef.current}`;
      const kind: ToastKind = opts.kind ?? 'success';
      const timeoutMs = opts.timeoutMs ?? 2000;
      setItems((prev) => [...prev, { id, message, kind }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, timeoutMs);
    },
    [],
  );

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <ToastView key={t.id} item={t} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item }: { item: ToastItem }) {
  const Icon = item.kind === 'error' ? AlertTriangle : item.kind === 'info' ? Info : Check;
  const accent =
    item.kind === 'error'
      ? 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger'
      : item.kind === 'info'
        ? 'border-ob-line bg-ob-surface text-ob-ink'
        : 'border-ob-signal/40 bg-ob-signal/10 text-ob-signal';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs shadow-lg backdrop-blur-sm ${accent}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{item.message}</span>
    </div>
  );
}
