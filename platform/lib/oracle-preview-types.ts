/**
 * Client-safe types for the preview subsystem. The main `oracle-preview.ts`
 * module imports `node:fs`, `node:child_process`, `chokidar`, and other
 * Node-only modules, so it cannot be imported into client components.
 * Keep all RSC / "use client" callers importing from here.
 */

import type { CompileError } from './oracle-preview-log';

export type PreviewStatus =
  | 'idle'
  | 'installing'
  | 'starting'
  | 'ready'
  | 'stopped'
  | 'error';

/**
 * Finer-grained lifecycle than `status`. `status` is kept for back-compat
 * with existing UI checks; `phase` is what new UI code should consume.
 *
 *   idle       -> nothing running
 *   installing -> npm install child alive
 *   compiling  -> next dev spawned; waiting for first compile
 *   first-paint-> one successful 200 seen; the page renders
 *   live       -> sustained 200s (>3s) — HMR stream confirmed healthy
 *   error      -> compile error, probe timeout, or spawn failure
 *   stopped    -> SIGTERM'd by user or graceful shutdown
 */
export type PreviewPhase =
  | 'idle'
  | 'installing'
  | 'compiling'
  | 'first-paint'
  | 'live'
  | 'error'
  | 'stopped';

export interface PreviewState {
  id: string;
  workspacePath: string;
  status: PreviewStatus;
  phase: PreviewPhase;
  port?: number;
  url?: string;
  startedAt?: string;
  readyAt?: string;
  error?: string;
  log: string[];
  compileErrors: CompileError[];
  crashCount: number;
  rebuildReason?: string;
  pid?: number;
  /** Epoch-ms of the last incoming proxy request for this preview. Used by
   *  the idle-timeout reaper to distinguish abandoned tabs from active ones.
   *  SSE keep-alives do NOT update this — only /preview/<id>/* HTTP hits. */
  lastHitAt: number;
}

export type { CompileError };
