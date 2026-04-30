/**
 * Account adapter — replaces the bundle's `lib/oracle-accounts.ts` and
 * `lib/require-account.ts`.
 *
 * Strategy: workspace ownership is recorded in the DB (orgId + ownerUserId
 * on the `workspaces` row). Path resolution looks up the row, then builds
 * the path. This decouples the lib code from request context — the
 * filesystem helpers don't need to peek at cookies.
 *
 * API routes still call `requireSession()` from `lib/auth.ts` first to gate
 * access; once they've verified ownership they pass the workspace ID to
 * the filesystem helpers.
 */
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workspaces } from '@/lib/db/schema';
import { getWorkspacesRoot } from './paths';

/** The directory on disk where this workspace's files live. */
export async function getWorkspaceDirById(workspaceId: string): Promise<string> {
  const row = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!row) {
    throw new Error(`workspace not found: ${workspaceId}`);
  }
  return path.join(getWorkspacesRoot(), row.orgId, row.id);
}

/** Cache-friendly wrapper for callers that already have the orgId. */
export function getWorkspaceDirForOrg(orgId: string, workspaceId: string): string {
  return path.join(getWorkspacesRoot(), orgId, workspaceId);
}
