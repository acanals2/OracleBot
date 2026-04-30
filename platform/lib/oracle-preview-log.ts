/**
 * Log classifier for `next dev` / webpack / turbopack / typescript output.
 *
 * The preview manager streams stdout+stderr line-by-line. We classify each
 * line so the manager can:
 *   - Short-circuit the readiness probe on compile errors (no point probing
 *     a server that can't render).
 *   - Surface structured `CompileError` records to the UI instead of a raw
 *     log blob, so the overlay can render file/line and a code frame.
 *   - Detect "fixed it" markers (`✓ Compiled`) to clear error state and
 *     resume probing after a recompile via HMR.
 *
 * Patterns are tuned to Next 14.x output. Each release tweaks them.
 */

export type LineKind =
  | 'ready' // server listening / page compiled
  | 'compile-error-start' // first line of a compile failure (next logs a block)
  | 'compile-error-frame' // continuation frame (file:line:col or stack)
  | 'compile-error-end' // blank or sentinel that closes the block
  | 'module-not-found'
  | 'typescript-error'
  | 'syntax-error'
  | 'runtime-error'
  | 'enoent'
  | 'warning'
  | 'info';

export interface LineClassification {
  kind: LineKind;
  file?: string;
  line?: number;
  column?: number;
  message?: string;
}

/**
 * Classify a single stdout/stderr line. Stateless — the caller accumulates
 * consecutive error frames into a block via `CompileErrorAccumulator`.
 */
export function classifyLogLine(raw: string): LineClassification {
  // Strip ANSI escapes — Next emits them even with FORCE_COLOR=0 in some paths.
  const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
  if (!line.trim()) return { kind: 'compile-error-end' };

  // Ready / listener markers (cheapest check — most lines in a healthy run hit this).
  if (/^\s*(✓|✔)\s+Compiled/i.test(line)) return { kind: 'ready', message: line };
  if (/^\s*(✓|✔)\s+Ready/i.test(line)) return { kind: 'ready', message: line };
  if (/Ready in\s+\d/i.test(line)) return { kind: 'ready', message: line };
  if (/started server on/i.test(line)) return { kind: 'ready', message: line };
  if (/^\s*- Local:/i.test(line)) return { kind: 'ready', message: line };

  // Explicit compile-failure markers.
  if (/^\s*(⨯|×|✗)\s+/.test(line) || /^Failed to compile\.?$/i.test(line)) {
    return { kind: 'compile-error-start', message: line.replace(/^\s*(⨯|×|✗)\s+/, '') };
  }
  if (/^\s*Error:\s+(.+)/.test(line) && !/ENOENT/.test(line)) {
    const m = line.match(/^\s*Error:\s+(.+)$/);
    return { kind: 'compile-error-start', message: m?.[1] ?? line };
  }

  // Structured module-not-found.
  const mnf = line.match(
    /^Module not found: (?:Error:\s+)?Can't resolve ['"](.+?)['"]\s+in\s+['"](.+?)['"]/,
  );
  if (mnf) {
    return {
      kind: 'module-not-found',
      file: mnf[2],
      message: `Can't resolve '${mnf[1]}'`,
    };
  }

  // TypeScript error frames: "path/to/file.tsx:12:34 - error TS2322: ..."
  const ts = line.match(
    /^\s*(.+\.(?:tsx?|jsx?|mjs|cjs)):(\d+):(\d+)\s*[-–]\s*error\s+TS\d+:\s*(.+)$/,
  );
  if (ts) {
    return {
      kind: 'typescript-error',
      file: ts[1],
      line: Number(ts[2]),
      column: Number(ts[3]),
      message: ts[4],
    };
  }

  // Plain file:line:col pointer (used in compile-error frames).
  const frame = line.match(
    /^\s*(?:\.\/)?(.+\.(?:tsx?|jsx?|mjs|cjs|css|scss)):(\d+)(?::(\d+))?\s*$/,
  );
  if (frame) {
    return {
      kind: 'compile-error-frame',
      file: frame[1],
      line: Number(frame[2]),
      column: frame[3] ? Number(frame[3]) : undefined,
    };
  }

  const syn = line.match(/^SyntaxError:\s+(.+)$/);
  if (syn) return { kind: 'syntax-error', message: syn[1] };

  if (/ENOENT: no such file or directory/i.test(line)) {
    const f = line.match(/['"]?([^\s'"]+)['"]?\s*$/);
    return { kind: 'enoent', file: f?.[1], message: line };
  }

  if (/^\s*(UnhandledPromiseRejection|TypeError|ReferenceError|RangeError):/i.test(line)) {
    return { kind: 'runtime-error', message: line };
  }

  if (/^\s*(⚠|warning:|warn\s+)/i.test(line)) return { kind: 'warning', message: line };

  return { kind: 'info', message: line };
}

export interface CompileError {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  stack: string[];
  firstSeenAt: string;
}

/**
 * Stateful block accumulator. Fed one classification at a time.
 */
export class CompileErrorAccumulator {
  private current: CompileError | null = null;

  push(cls: LineClassification, rawLine: string): CompileError | null {
    switch (cls.kind) {
      case 'compile-error-start':
      case 'module-not-found':
      case 'typescript-error':
      case 'syntax-error':
      case 'runtime-error':
      case 'enoent': {
        const prior = this.current;
        this.current = {
          file: cls.file,
          line: cls.line,
          column: cls.column,
          message: cls.message ?? rawLine,
          stack: [rawLine],
          firstSeenAt: new Date().toISOString(),
        };
        return prior;
      }
      case 'compile-error-frame': {
        if (this.current) {
          this.current.stack.push(rawLine);
          if (!this.current.file && cls.file) {
            this.current.file = cls.file;
            this.current.line = cls.line;
            this.current.column = cls.column;
          }
        }
        return null;
      }
      case 'compile-error-end': {
        if (this.current && this.current.stack.length > 0) {
          const finished = this.current;
          this.current = null;
          return finished;
        }
        return null;
      }
      case 'ready': {
        const prior = this.current;
        this.current = null;
        return prior;
      }
      case 'warning':
      case 'info':
      default: {
        if (this.current) this.current.stack.push(rawLine);
        return null;
      }
    }
  }

  flush(): CompileError | null {
    const prior = this.current;
    this.current = null;
    return prior;
  }

  hasInFlight(): boolean {
    return this.current !== null;
  }
}

export function isTerminalError(cls: LineClassification): boolean {
  return (
    cls.kind === 'compile-error-start' ||
    cls.kind === 'module-not-found' ||
    cls.kind === 'typescript-error' ||
    cls.kind === 'syntax-error' ||
    cls.kind === 'enoent'
  );
}

export function isRecoveryMarker(cls: LineClassification): boolean {
  return cls.kind === 'ready';
}
