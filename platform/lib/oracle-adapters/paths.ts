/**
 * Filesystem path adapter — replaces the bundle's `lib/paths.ts`.
 *
 * Two roots, both gitignored:
 *   - WORKSPACES_ROOT     → user code, organized as <root>/<orgId>/<workspaceId>/
 *   - CHECKPOINTS_ROOT    → snapshot JSONs, organized as <root>/<orgId>/<workspaceId>/
 *
 * Defaults to <repo-root>/oracle-workspaces and oracle-checkpoints. Override
 * via env so a deploy host can mount a persistent volume elsewhere (Railway,
 * Fly.io, etc.).
 */
import path from 'node:path';

/** Resolve project root by walking up from this file until we find package.json. */
function repoRoot(): string {
  // Two levels up: lib/oracle-adapters/paths.ts → lib → platform
  return path.resolve(__dirname, '..', '..');
}

export function getWorkspacesRoot(): string {
  return process.env.WORKSPACES_ROOT
    ? path.resolve(process.env.WORKSPACES_ROOT)
    : path.join(repoRoot(), 'oracle-workspaces');
}

export function getCheckpointsRoot(): string {
  return process.env.CHECKPOINTS_ROOT
    ? path.resolve(process.env.CHECKPOINTS_ROOT)
    : path.join(repoRoot(), 'oracle-checkpoints');
}

/** Compatibility shim used by the ported `oracle-checkpoints.ts`. */
export function getSnapshotsDir(): string {
  // Original code resolves checkpoints as `path.resolve(snapshotsDir, '..', 'oracle-checkpoints')`.
  // We give it a sibling that lands at our checkpoints root.
  return path.join(getCheckpointsRoot(), '..', '_checkpoints-anchor');
}
