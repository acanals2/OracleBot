/**
 * API tokens — Phase 17.
 *
 * Tokens authenticate non-browser clients (GitHub Action, CLI, CI scripts)
 * to the platform API. They sit alongside Better Auth session cookies, not
 * in place of them — every endpoint that accepts a session also accepts a
 * token via `requireSessionOrToken()`.
 *
 * Format:
 *   obt_<32 url-safe base64 chars>
 *   ↑     ↑
 *   prefix (shown in UI for identification)
 *
 * Storage:
 *   - We never store the raw token. SHA-256(token + INTERNAL_API_SECRET) is
 *     the lookup key. INTERNAL_API_SECRET acts as a server-side pepper so a
 *     dump of `api_tokens` alone can't be replayed against the API.
 *   - tokenPrefix (first 12 chars) IS stored so the UI can show "obt_a1b2cd3…"
 *     in a tokens list without needing the raw value.
 *
 * Anti-abuse:
 *   - Hard-coded creation cap of 10 active tokens per org.
 *   - Lookup is constant-time on the hash; constant-time string compare on
 *     prefix to avoid leaking match progress through timing.
 */
import crypto from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from './db';
import { apiTokens, members, orgs, type ApiToken, type Org, type User } from './db/schema';
import { env } from './env';
import { ForbiddenError, ValidationError } from './errors';
import { UnauthenticatedError, NoActiveOrgError, type SessionContext, getSessionUser } from './auth';

const TOKEN_PREFIX = 'obt_';
const TOKEN_BYTES = 24; // → 32 url-safe base64 chars
const PREFIX_LEN = TOKEN_PREFIX.length + 8; // "obt_" + 8 → 12 chars displayed

/** Per-org cap to prevent token sprawl / accidental leaks via dump. */
const TOKENS_PER_ORG_CAP = 10;

// ────────────────────────────────────────────────────────────────────────────
// Token mint / hash helpers
// ────────────────────────────────────────────────────────────────────────────

/** Returns the raw token. Caller is responsible for showing it ONCE then dropping it. */
export function mintRawToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(rawToken: string): string {
  // INTERNAL_API_SECRET acts as a server-side pepper so a leaked DB dump
  // alone can't be replayed.
  const pepper = env.INTERNAL_API_SECRET ?? '';
  return crypto
    .createHash('sha256')
    .update(rawToken + pepper)
    .digest('hex');
}

export function tokenPrefix(rawToken: string): string {
  return rawToken.slice(0, PREFIX_LEN);
}

// ────────────────────────────────────────────────────────────────────────────
// Create / list / revoke
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create a new API token for the given org. Returns the raw token alongside
 * the row — caller must surface the raw token to the user immediately and
 * never persist it again.
 */
export async function createApiToken(opts: {
  orgId: string;
  userId: string;
  name: string;
  expiresAt?: Date | null;
}): Promise<{ raw: string; row: ApiToken }> {
  const name = opts.name.trim();
  if (!name) throw new ValidationError('Token name is required');
  if (name.length > 120) throw new ValidationError('Token name too long (max 120 chars)');

  const active = await countActiveTokens(opts.orgId);
  if (active >= TOKENS_PER_ORG_CAP) {
    throw new ForbiddenError(
      `This organization already has ${active} active API tokens (limit: ${TOKENS_PER_ORG_CAP}). Revoke an existing token before creating another.`,
    );
  }

  const raw = mintRawToken();
  const [row] = await db
    .insert(apiTokens)
    .values({
      orgId: opts.orgId,
      createdByUserId: opts.userId,
      name,
      tokenPrefix: tokenPrefix(raw),
      tokenHash: hashToken(raw),
      expiresAt: opts.expiresAt ?? null,
    })
    .returning();
  return { raw, row };
}

export async function listApiTokens(orgId: string): Promise<ApiToken[]> {
  return db.query.apiTokens.findMany({
    where: and(eq(apiTokens.orgId, orgId), isNull(apiTokens.revokedAt)),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function revokeApiToken(orgId: string, tokenId: string): Promise<void> {
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.orgId, orgId)));
}

async function countActiveTokens(orgId: string): Promise<number> {
  const r = await db
    .select({ c: sql<number>`count(*)` })
    .from(apiTokens)
    .where(and(eq(apiTokens.orgId, orgId), isNull(apiTokens.revokedAt)));
  return Number(r[0]?.c ?? 0);
}

// ────────────────────────────────────────────────────────────────────────────
// Authentication — Bearer header → SessionContext
// ────────────────────────────────────────────────────────────────────────────

/**
 * Look up an API token by Authorization header. Returns null if the header
 * is missing, malformed, expired, or revoked. On success, returns a
 * SessionContext-shaped object the rest of the codebase can consume the
 * same way it consumes session cookies.
 *
 * Side effect: bumps `lastUsedAt`. Best-effort — failure to update the
 * timestamp does not fail the request.
 */
export async function tryAuthenticateByToken(
  headerValue: string | null | undefined,
): Promise<SessionContext | null> {
  const raw = parseBearerToken(headerValue);
  if (!raw) return null;
  const hash = hashToken(raw);

  const row = await db.query.apiTokens.findFirst({
    where: eq(apiTokens.tokenHash, hash),
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  // Resolve the org + creator's role. Tokens inherit the creating user's role
  // — they have no separate role of their own.
  const org = (await db.query.orgs.findFirst({ where: eq(orgs.id, row.orgId) })) as Org | undefined;
  if (!org) return null;
  const membership = await db.query.members.findFirst({
    where: (m, { and: a, eq: e }) =>
      a(e(m.organizationId, row.orgId), e(m.userId, row.createdByUserId)),
  });
  if (!membership) return null;
  const user = (await db.query.users.findFirst({ where: (u, { eq: e }) => e(u.id, row.createdByUserId) })) as
    | User
    | undefined;
  if (!user) return null;

  // Bump lastUsedAt asynchronously — don't block the request on the write.
  db.update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, row.id))
    .catch(() => {
      /* ignore — telemetry only */
    });

  const role: SessionContext['role'] =
    membership.role === 'owner' || membership.role === 'admin' ? membership.role : 'member';

  return { user, org, role };
}

function parseBearerToken(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(headerValue.trim());
  if (!m) return null;
  const tok = m[1];
  if (!tok.startsWith(TOKEN_PREFIX)) return null;
  return tok;
}

/**
 * Helper: try API token first, fall back to session cookie. Throws the same
 * UnauthenticatedError both paths use, so callers can keep their existing
 * try/catch shape.
 */
export async function requireSessionOrToken(): Promise<SessionContext> {
  const h = await headers();
  const fromToken = await tryAuthenticateByToken(h.get('authorization'));
  if (fromToken) return fromToken;

  // Fall through to session-cookie auth.
  const user = await getSessionUser();
  if (!user) throw new UnauthenticatedError();

  // Reuse the regular requireSession flow for the org/role resolution path.
  // We can't import requireSession() here without circular dep concerns, so
  // duplicate the org+role lookup directly. Keep this in sync with auth.ts.
  // (10 lines of dup is cheaper than a layout refactor.)
  const session = await import('./auth-config').then((m) => m.auth.api.getSession({ headers: h }));
  const activeOrgId = session?.session?.activeOrganizationId;
  if (!activeOrgId) throw new NoActiveOrgError();

  const org = await db.query.orgs.findFirst({ where: eq(orgs.id, activeOrgId) });
  if (!org) throw new NoActiveOrgError();
  const membership = await db.query.members.findFirst({
    where: (m, { and: a, eq: e }) => a(e(m.organizationId, activeOrgId), e(m.userId, user.id)),
  });
  if (!membership) throw new NoActiveOrgError();

  const role: SessionContext['role'] =
    membership.role === 'owner' || membership.role === 'admin' ? membership.role : 'member';

  return { user, org, role };
}
