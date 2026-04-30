/**
 * Server-side auth helpers built on Better Auth.
 *
 * Pattern: every server action / API route that touches user data calls
 * `requireSession()` to get the authenticated user + their active org. If
 * either is missing it throws — the caller turns that into a 401/403 via
 * `apiError()` from `lib/api-helpers.ts`.
 */
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { auth } from './auth-config';
import { db } from './db';
import { members, orgs, users, type Org, type User } from './db/schema';

export class UnauthenticatedError extends Error {
  status = 401 as const;
  constructor() {
    super('Not signed in.');
  }
}

export class NoActiveOrgError extends Error {
  status = 403 as const;
  constructor() {
    super('No active organization selected.');
  }
}

export class NotInOrgError extends Error {
  status = 403 as const;
  constructor() {
    super('You are not a member of this organization.');
  }
}

export interface SessionContext {
  user: User;
  org: Org;
  role: 'owner' | 'admin' | 'member';
}

/**
 * Resolve the Better Auth session from the incoming request cookies.
 * Returns null if not signed in. Doesn't touch the org.
 */
export async function getSessionUser(): Promise<User | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  // Better Auth's user shape is compatible with our schema; coerce to our type.
  return session.user as unknown as User;
}

/**
 * The full session context: user + their currently-active org + role.
 * Use this in any handler that touches org-scoped data.
 */
export async function requireSession(): Promise<SessionContext> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new UnauthenticatedError();

  const user = session.user as unknown as User;
  const activeOrgId = session.session?.activeOrganizationId;

  if (!activeOrgId) throw new NoActiveOrgError();

  const org = await db.query.orgs.findFirst({
    where: eq(orgs.id, activeOrgId),
  });
  if (!org) throw new NoActiveOrgError();

  const membership = await db.query.members.findFirst({
    where: (m, { and, eq: e }) =>
      and(e(m.organizationId, activeOrgId), e(m.userId, user.id)),
  });
  if (!membership) throw new NotInOrgError();

  // Better Auth role values are 'owner' | 'admin' | 'member' as plain strings.
  // Narrow to our union type with a defensive default.
  const role: SessionContext['role'] =
    membership.role === 'owner' || membership.role === 'admin' ? membership.role : 'member';

  return { user, org, role };
}

/** Variant that returns null instead of throwing — for optional-auth views. */
export async function getSessionOrNull(): Promise<SessionContext | null> {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}

/**
 * Best-effort lookup of every org the current user belongs to. Used by the
 * OrganizationSwitcher / dashboard to populate the picker without going
 * through Better Auth's API for the listing call (we already have the
 * relations in our DB).
 */
export async function listUserOrgs(userId: string): Promise<Org[]> {
  const rows = await db
    .select({ org: orgs })
    .from(members)
    .innerJoin(orgs, eq(members.organizationId, orgs.id))
    .where(eq(members.userId, userId));
  return rows.map((r) => r.org);
}

/**
 * Re-export the User helpers from the schema for ergonomic imports.
 * Some callers want raw types without pulling from the schema directly.
 */
export type { User, Org } from './db/schema';

/**
 * Idempotent: ensure the signed-in user has at least one org and that
 * their session has an activeOrganizationId set. Runs on first hit of
 * any /app/* page so a brand-new sign-up lands in a working workspace
 * instead of an empty-state wall.
 */
export async function ensureActiveOrgForUser(userId: string): Promise<string> {
  const existing = await listUserOrgs(userId);
  if (existing.length > 0) {
    return existing[0].id;
  }

  // No org yet — create a personal one. We use Better Auth's API so the
  // member row + role assignment happen atomically.
  const result = await auth.api.createOrganization({
    body: {
      name: 'My workspace',
      slug: `ws-${userId.slice(0, 8)}-${Date.now().toString(36)}`,
    },
    headers: await headers(),
  });
  if (!result || !('id' in result)) {
    throw new Error('Failed to create personal organization.');
  }
  return result.id as string;
}
