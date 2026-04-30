/**
 * Preview-provider abstraction.
 *
 * The bundle ships with a process-based runner (`local`) that calls
 * `child_process.spawn('next dev')` directly. That's right for development
 * and single-tenant Railway, but is NOT safe for untrusted multi-tenant
 * production — process boundary, no seccomp, no resource quotas.
 *
 * Switching to a microVM provider (E2B, Modal, etc.) is a single env-var
 * change once that provider is wired up. The lib code never calls `spawn`
 * directly — it goes through this interface.
 */

export interface PreviewStartOptions {
  /** Workspace id (used as a stable label for telemetry / logging). */
  id: string;
  /** Absolute path on the host filesystem where the user's code lives. */
  workspacePath: string;
  /** When true, kill any existing instance + clear .next before starting. */
  hardRebuild?: boolean;
  /** Free-form reason string for logs. */
  restartReason?: string;
}

export interface PreviewStartResult {
  /** A URL the iframe can load. For local provider, includes the proxy path. */
  url: string;
  /** TCP port the runtime is listening on (only meaningful for `local`). */
  port?: number;
  /** OS pid of the runtime (only meaningful for `local`). */
  pid?: number;
}

export interface PreviewProvider {
  readonly name: 'local' | 'e2b';
  start(opts: PreviewStartOptions): Promise<PreviewStartResult>;
  stop(id: string): Promise<void>;
  isAlive(id: string): boolean;
}

export type ProviderName = PreviewProvider['name'];

/** Read-only check for the active provider. */
export function getActiveProviderName(): ProviderName {
  const env = process.env.ORACLE_PREVIEW_PROVIDER?.toLowerCase();
  if (env === 'e2b') return 'e2b';
  return 'local';
}
