/**
 * Local provider — wraps the host-process spawn implementation in
 * `lib/oracle-preview.ts`. It IS the de-facto local provider today;
 * this file gives that fact a stable name + import path.
 *
 * When E2B (or another VM-level provider) is wired up, the API routes
 * will pivot to import from `oracle-providers` instead of `oracle-preview`
 * directly, and the switching logic in `index.ts` will route to whichever
 * provider matches `ORACLE_PREVIEW_PROVIDER`.
 *
 * Caveat (recopying the README warning): the bundle's spawn-based runner
 * provides PROCESS-BOUNDARY isolation only — adequate for a single-user
 * dev tool, not adequate for untrusted multi-tenant production. Pair with
 * Docker/firejail/seccomp at the OS layer if you must run this on a
 * public host before E2B is online.
 */
import {
  startPreview as _startPreview,
  stopPreview as _stopPreview,
  getPreviewState,
  type StartPreviewOptions,
} from '../oracle-preview';
import type { PreviewProvider, PreviewStartOptions, PreviewStartResult } from './types';

export const localProvider: PreviewProvider = {
  name: 'local',
  async start(opts: PreviewStartOptions): Promise<PreviewStartResult> {
    const startOpts: StartPreviewOptions = {
      hardRebuild: opts.hardRebuild,
      restartReason: opts.restartReason,
    };
    const state = await _startPreview(opts.id, startOpts);
    return {
      url: state.url ?? `/preview/${encodeURIComponent(opts.id)}`,
      port: state.port,
      pid: state.pid,
    };
  },
  async stop(id: string): Promise<void> {
    _stopPreview(id);
  },
  isAlive(id: string): boolean {
    const s = getPreviewState(id);
    return !!s && (s.phase === 'compiling' || s.phase === 'first-paint' || s.phase === 'live');
  },
};

// Convenience re-exports for routes that want the rich state machine, not
// just the abstract interface. New code should prefer importing from
// `oracle-providers` (selects local vs. e2b at runtime).
export {
  startPreview,
  stopPreview,
  getPreviewState,
  subscribeToPreviewEvents,
  touchPreview,
  waitForPreviewReady,
  listPreviews,
} from '../oracle-preview';
