'use client';

/**
 * Full-coverage overlay for the preview pane when compilation fails or the
 * dev server crashes. Adapted from the bundle's `CompileErrorOverlay.tsx`
 * with our Tailwind palette (ob-bg / ob-surface / ob-signal / etc.) instead
 * of the original `rgb(var(--bg))` theme tokens.
 *
 * Three action pills:
 *   - Retry: triggers a hard rebuild
 *   - Open log: surfaces the raw stdout/stderr
 *   - Copy error: copies the formatted error block (replaces the bundle's
 *     "Ask Oracle to fix" — that hooks into a chat agent we haven't ported)
 */
import { useState } from 'react';
import { AlertCircle, RotateCw, Terminal, Copy } from 'lucide-react';
import type { PreviewState } from '@/lib/oracle-preview-types';

interface CompileErrorOverlayProps {
  preview: PreviewState;
  onRetry: () => void;
  onOpenLog: () => void;
}

export function CompileErrorOverlay({
  preview,
  onRetry,
  onOpenLog,
}: CompileErrorOverlayProps) {
  const hasCompileErrors = preview.compileErrors && preview.compileErrors.length > 0;
  const errors = preview.compileErrors ?? [];
  const primary = errors[0];
  const extras = errors.slice(1);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCrashWithoutCompile = preview.phase === 'error' && !hasCompileErrors;

  const formatErrorBlock = () => {
    if (hasCompileErrors) {
      return errors
        .map((e) => {
          const loc = e.file
            ? `${e.file}${e.line ? `:${e.line}` : ''}${e.column ? `:${e.column}` : ''}`
            : '';
          return `${loc ? loc + '\n' : ''}${e.stack.join('\n')}`;
        })
        .join('\n\n---\n\n');
    }
    const tail = preview.log.slice(-20).join('\n');
    return preview.error ? `${preview.error}\n\n${tail}` : tail;
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatErrorBlock());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-ob-bg/80 backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
    >
      <div className="relative w-[min(640px,92%)] overflow-hidden rounded-2xl border border-ob-line-strong bg-ob-surface shadow-card">
        <div className="flex items-center justify-between border-b border-ob-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ob-danger/15 text-ob-danger">
              <AlertCircle className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ob-ink">
                {isCrashWithoutCompile
                  ? 'Preview server crashed'
                  : `${errors.length} compile error${errors.length === 1 ? '' : 's'}`}
              </div>
              <div className="text-xs text-ob-muted">
                {isCrashWithoutCompile
                  ? (preview.error ?? 'The dev server exited unexpectedly.')
                  : "We can't render your preview until these are fixed."}
              </div>
            </div>
          </div>
          {preview.crashCount > 0 && preview.phase !== 'live' && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
              auto-restarts: {preview.crashCount}
            </span>
          )}
        </div>

        {hasCompileErrors && primary && (
          <div className="max-h-[280px] overflow-y-auto px-5 py-4 text-xs leading-relaxed">
            {primary.file && (
              <div className="mb-2 font-mono text-[11.5px] text-ob-signal">
                {primary.file}
                {primary.line ? `:${primary.line}` : ''}
                {primary.column ? `:${primary.column}` : ''}
              </div>
            )}
            <div className="mb-2 font-medium text-ob-ink">{primary.message}</div>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-ob-bg p-3 font-mono text-[11.5px] text-ob-muted">
              {primary.stack.join('\n')}
            </pre>
            {extras.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 text-[11.5px] text-ob-signal hover:underline"
              >
                {expanded ? 'Hide' : '+'} {extras.length} more error
                {extras.length === 1 ? '' : 's'}
              </button>
            )}
            {expanded && (
              <div className="mt-3 space-y-3">
                {extras.map((e, i) => (
                  <div key={i}>
                    {e.file && (
                      <div className="font-mono text-[11px] text-ob-signal">
                        {e.file}
                        {e.line ? `:${e.line}` : ''}
                      </div>
                    )}
                    <div className="text-[11.5px] text-ob-ink">{e.message}</div>
                    <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-ob-bg p-2 font-mono text-[11px] text-ob-muted">
                      {e.stack.join('\n')}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isCrashWithoutCompile && preview.log.length > 0 && (
          <div className="max-h-[200px] overflow-y-auto px-5 py-4">
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-ob-bg p-3 font-mono text-[11.5px] text-ob-muted">
              {preview.log.slice(-15).join('\n')}
            </pre>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-ob-line px-5 py-3">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-full bg-ob-signal px-3 py-1.5 text-[11.5px] font-medium text-ob-bg transition-opacity hover:opacity-90"
          >
            <RotateCw className="h-3 w-3" />
            Retry
          </button>
          <button
            type="button"
            onClick={onOpenLog}
            className="inline-flex items-center gap-1.5 rounded-full border border-ob-line px-3 py-1.5 text-[11.5px] text-ob-ink transition-colors hover:bg-ob-surface/80"
          >
            <Terminal className="h-3 w-3" />
            Open log
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 rounded-full border border-ob-line px-3 py-1.5 text-[11.5px] text-ob-ink transition-colors hover:bg-ob-surface/80"
          >
            <Copy className="h-3 w-3" />
            {copied ? 'Copied' : 'Copy error'}
          </button>
        </div>
      </div>
    </div>
  );
}
