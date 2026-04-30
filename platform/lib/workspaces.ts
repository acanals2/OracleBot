/**
 * Workspace CRUD + ownership checks built on the schema's `workspaces` table.
 *
 * API routes call `requireWorkspaceForSession(workspaceId)` — it loads the
 * row, verifies it belongs to the caller's active org, and returns the
 * row. Anything else (ports, file CRUD) goes through the workspace ID
 * after that.
 */
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workspaces, type NewWorkspace, type Workspace } from '@/lib/db/schema';
import { requireSession, type SessionContext } from '@/lib/auth';
import { getMaxWorkspacesForOrg } from '@/lib/oracle-adapters/tier';
import { ensureWorkspace, seedDefaultStarter, clearWorkspace } from '@/lib/oracle-workspace';
import { z } from 'zod';

export class WorkspaceNotFoundError extends Error {
  status = 404 as const;
  constructor(id: string) {
    super(`Workspace not found: ${id}`);
  }
}

export class WorkspaceForbiddenError extends Error {
  status = 403 as const;
  constructor() {
    super('You do not have access to this workspace.');
  }
}

export class WorkspaceLimitError extends Error {
  status = 403 as const;
  cap: number;
  count: number;
  constructor(cap: number, count: number) {
    super(`Workspace limit reached (${count}/${cap}). Delete one first or upgrade your plan.`);
    this.cap = cap;
    this.count = count;
  }
}

export const createWorkspaceInput = z.object({
  name: z.string().trim().min(1).max(80),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInput>;

export async function listWorkspacesForOrg(orgId: string, limit = 50): Promise<Workspace[]> {
  return db
    .select()
    .from(workspaces)
    .where(eq(workspaces.orgId, orgId))
    .orderBy(desc(workspaces.lastOpenedAt), desc(workspaces.createdAt))
    .limit(limit);
}

/** Look up a workspace and confirm the caller owns it (via org membership). */
export async function requireWorkspaceForSession(
  session: SessionContext,
  workspaceId: string,
): Promise<Workspace> {
  const row = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  if (!row) throw new WorkspaceNotFoundError(workspaceId);
  if (row.orgId !== session.org.id) throw new WorkspaceForbiddenError();
  return row;
}

export async function createWorkspaceForSession(
  session: SessionContext,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  // Tier check — soft cap.
  const cap = await getMaxWorkspacesForOrg(session.org.id);
  if (Number.isFinite(cap)) {
    const existing = await listWorkspacesForOrg(session.org.id, 1000);
    if (existing.length >= cap) {
      throw new WorkspaceLimitError(cap, existing.length);
    }
  }

  const newRow: NewWorkspace = {
    orgId: session.org.id,
    ownerUserId: session.user.id,
    name: input.name,
    lastOpenedAt: new Date(),
  };
  const [row] = await db.insert(workspaces).values(newRow).returning();

  // Seed the on-disk workspace with starter Next.js files so a fresh
  // `Launch preview` actually compiles to something visible.
  await ensureWorkspace(row.id);
  await seedDefaultStarter(row.id);

  return row;
}

/** Update lastOpenedAt — best-effort. */
export async function touchWorkspace(workspaceId: string): Promise<void> {
  await db
    .update(workspaces)
    .set({ lastOpenedAt: new Date(), updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
}

/** Hard-delete: remove the DB row + the on-disk directory. The preview
 *  process (if any) is NOT auto-stopped here — call from the API after
 *  stopping the preview explicitly. */
export async function deleteWorkspaceForSession(
  session: SessionContext,
  workspaceId: string,
): Promise<void> {
  const row = await requireWorkspaceForSession(session, workspaceId);
  await clearWorkspace(workspaceId).catch(() => {});
  await db.delete(workspaces).where(and(eq(workspaces.id, row.id), eq(workspaces.orgId, session.org.id)));
}

/** Convenience: load + auth at once for use in API routes. */
export async function loadWorkspaceForRequest(workspaceId: string): Promise<{
  session: SessionContext;
  workspace: Workspace;
}> {
  const session = await requireSession();
  const workspace = await requireWorkspaceForSession(session, workspaceId);
  return { session, workspace };
}
