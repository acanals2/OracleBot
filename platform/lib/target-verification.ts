/**
 * Target / domain verification.
 *
 * Before a run can target an external URL, the requesting org must prove
 * it owns the URL's domain. Two methods are supported:
 *
 *   - dns_txt: org publishes `oracle-bot-verify=<token>` as a TXT record.
 *   - well_known_file: org serves `<token>` at
 *     `https://<domain>/.well-known/oraclebot.txt`.
 *
 * A small carve-out list bypasses the table entirely for hosts where
 * domain ownership doesn't make sense (localhost, deploy-preview hosts,
 * documentation domains).
 *
 * Public surface:
 *   - normalizeDomain(input)
 *   - isCarveOut(domain) — true if the domain is auto-pass
 *   - assertDomainVerified(orgId, url) — throws ForbiddenError if not OK
 *   - createChallenge(orgId, domain, method) — creates / refreshes a token
 *   - runVerification(verificationId) — performs the lookup, updates state
 *   - getVerificationStatus(orgId, domain) — read-only lookup for UI
 */
import { and, eq } from 'drizzle-orm';
import { Resolver } from 'node:dns/promises';
import crypto from 'node:crypto';
import { db } from './db';
import { targetVerifications, type TargetVerification } from './db/schema';
import { ForbiddenError, ValidationError } from './errors';

// ── Carve-outs ────────────────────────────────────────────────────────────

/**
 * Hosts that auto-pass verification. We don't ask users to verify
 *   - localhost (no public DNS to verify against)
 *   - deploy-preview wildcards (host enforces ownership)
 *   - common documentation domains (low abuse risk)
 *   - our own marketing/preview domains
 */
const CARVE_OUT_EXACT = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'example.com',
  'example.org',
  'example.net',
  'httpbin.org',
]);

const CARVE_OUT_SUFFIXES: ReadonlyArray<string> = [
  '.vercel.app',
  '.railway.app',
  '.up.railway.app',
  '.oraclebot.net',
];

export function isCarveOut(domain: string): boolean {
  const d = normalizeDomain(domain);
  if (CARVE_OUT_EXACT.has(d)) return true;
  for (const suffix of CARVE_OUT_SUFFIXES) {
    if (d === suffix.slice(1)) return true; // exact apex (e.g. 'vercel.app' itself)
    if (d.endsWith(suffix)) return true;
  }
  return false;
}

// ── Domain helpers ────────────────────────────────────────────────────────

/**
 * Extract the lowercase hostname from a URL string. Strips scheme, port,
 * path, query, fragment. Throws ValidationError on invalid input.
 */
export function normalizeDomain(input: string): string {
  let raw = input.trim();
  if (!raw) throw new ValidationError('Domain is required');
  // Allow bare hostnames by prepending a scheme so URL parses cleanly.
  if (!/^[a-z]+:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ValidationError('Invalid URL or hostname');
  }
  return url.hostname.toLowerCase();
}

// ── Token generation ──────────────────────────────────────────────────────

const TOKEN_PREFIX = 'oracle-bot-verify=';
const VERIFICATION_TTL_DAYS = 90;

function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function expiresFromNow(): Date {
  return new Date(Date.now() + VERIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// ── Main entry points ─────────────────────────────────────────────────────

/**
 * Create or refresh a verification challenge for a given org+domain. Returns
 * the row including the token. If a verification already exists for this
 * (org, domain), we rotate its token and method and return the same row id.
 */
export async function createChallenge(
  orgId: string,
  domainInput: string,
  method: 'dns_txt' | 'well_known_file',
): Promise<TargetVerification> {
  const domain = normalizeDomain(domainInput);
  if (isCarveOut(domain)) {
    throw new ValidationError(
      `${domain} is on the carve-out list and does not require verification`,
    );
  }

  const existing = await db.query.targetVerifications.findFirst({
    where: and(
      eq(targetVerifications.orgId, orgId),
      eq(targetVerifications.domain, domain),
    ),
  });

  const token = generateToken();
  const expiresAt = expiresFromNow();

  if (existing) {
    const [updated] = await db
      .update(targetVerifications)
      .set({
        challengeToken: token,
        method,
        status: 'pending',
        verifiedAt: null,
        expiresAt,
        lastCheckedAt: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(targetVerifications.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(targetVerifications)
    .values({
      orgId,
      domain,
      challengeToken: token,
      method,
      status: 'pending',
      expiresAt,
    })
    .returning();
  return created;
}

/**
 * Lookup a verification row by id, scoped to the requesting org so a
 * cross-org id can't be probed.
 */
export async function getVerificationForOrg(
  orgId: string,
  id: string,
): Promise<TargetVerification | null> {
  const row = await db.query.targetVerifications.findFirst({
    where: and(eq(targetVerifications.id, id), eq(targetVerifications.orgId, orgId)),
  });
  return row ?? null;
}

/**
 * List all verifications for an org (for the settings UI).
 */
export async function listVerificationsForOrg(orgId: string): Promise<TargetVerification[]> {
  return db.query.targetVerifications.findMany({
    where: eq(targetVerifications.orgId, orgId),
    orderBy: (v, { desc }) => [desc(v.createdAt)],
  });
}

/**
 * Lookup the most recent verification for (orgId, domain). Used by the
 * wizard to inline-render verification status as the user types a URL.
 */
export async function getVerificationStatus(
  orgId: string,
  domainInput: string,
): Promise<{
  state: 'verified' | 'pending' | 'failed' | 'expired' | 'unverified' | 'carve_out';
  verification: TargetVerification | null;
  domain: string;
}> {
  const domain = normalizeDomain(domainInput);
  if (isCarveOut(domain)) {
    return { state: 'carve_out', verification: null, domain };
  }
  const verification = await db.query.targetVerifications.findFirst({
    where: and(
      eq(targetVerifications.orgId, orgId),
      eq(targetVerifications.domain, domain),
    ),
  });
  if (!verification) return { state: 'unverified', verification: null, domain };

  const now = new Date();
  if (verification.status === 'verified') {
    if (verification.expiresAt < now) {
      return { state: 'expired', verification, domain };
    }
    return { state: 'verified', verification, domain };
  }
  return { state: verification.status, verification, domain };
}

/**
 * Run the actual verification check (DNS lookup or well-known fetch).
 * Updates the row's status and lastCheckedAt + lastError. Returns the
 * fresh row.
 */
export async function runVerification(
  orgId: string,
  id: string,
): Promise<TargetVerification> {
  const row = await getVerificationForOrg(orgId, id);
  if (!row) throw new ValidationError('Verification not found');
  if (row.expiresAt < new Date()) {
    const [updated] = await db
      .update(targetVerifications)
      .set({ status: 'expired', lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(targetVerifications.id, row.id))
      .returning();
    return updated;
  }

  let ok = false;
  let error: string | null = null;

  try {
    if (row.method === 'dns_txt') {
      ok = await checkDnsTxt(row.domain, row.challengeToken);
      if (!ok) {
        error = `DNS TXT record not found at ${row.domain}. Ensure a TXT record with value "${TOKEN_PREFIX}${row.challengeToken}" is published, then retry. DNS propagation can take a few minutes.`;
      }
    } else {
      ok = await checkWellKnownFile(row.domain, row.challengeToken);
      if (!ok) {
        error = `Could not fetch https://${row.domain}/.well-known/oraclebot.txt with body "${row.challengeToken}". Ensure the file is reachable.`;
      }
    }
  } catch (e) {
    error = `Verification check threw: ${(e as Error).message}`;
  }

  const [updated] = await db
    .update(targetVerifications)
    .set({
      status: ok ? 'verified' : 'failed',
      verifiedAt: ok ? new Date() : null,
      lastCheckedAt: new Date(),
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(targetVerifications.id, row.id))
    .returning();
  return updated;
}

/**
 * Run-creation guard. Throws ForbiddenError if the URL's domain is not
 * verified by the requesting org and not on the carve-out list.
 */
export async function assertDomainVerified(orgId: string, url: string): Promise<void> {
  const status = await getVerificationStatus(orgId, url);
  if (status.state === 'verified' || status.state === 'carve_out') return;

  const reasonByState: Record<string, string> = {
    unverified: `Domain ${status.domain} has not been verified for this organization. Add it under Settings → Domains.`,
    pending: `Domain ${status.domain} verification is still pending. Run the check from Settings → Domains.`,
    failed: `Domain ${status.domain} verification failed. Review the error in Settings → Domains and retry.`,
    expired: `Domain ${status.domain} verification expired. Re-run the check from Settings → Domains.`,
  };

  throw new ForbiddenError(
    reasonByState[status.state] ?? `Domain ${status.domain} is not verified.`,
    { domain: status.domain, state: status.state },
  );
}

// ── Verification implementations ─────────────────────────────────────────

async function checkDnsTxt(domain: string, token: string): Promise<boolean> {
  // Use a fresh resolver with public servers so corporate DNS shenanigans
  // don't trip us up. Quad9 + Cloudflare for redundancy.
  const resolver = new Resolver({ timeout: 5_000, tries: 2 });
  resolver.setServers(['9.9.9.9', '1.1.1.1', '8.8.8.8']);
  const expected = `${TOKEN_PREFIX}${token}`;

  // Try the apex first, then `_oracle-bot.<domain>` as a polite alternative
  // (some users prefer not to add TXT at apex when it's a customer-facing
  // domain — a subdomain prefix keeps DNS clean).
  const candidates = [domain, `_oracle-bot.${domain}`];
  for (const host of candidates) {
    try {
      const records = await resolver.resolveTxt(host);
      // resolveTxt returns string[][]; each subarray represents one TXT
      // record split on 255-byte boundaries — join before comparing.
      for (const chunks of records) {
        const joined = chunks.join('');
        if (joined === expected) return true;
      }
    } catch {
      // NXDOMAIN / no records — try next candidate.
    }
  }
  return false;
}

async function checkWellKnownFile(domain: string, token: string): Promise<boolean> {
  const url = `https://${domain}/.well-known/oraclebot.txt`;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      // Hard-coded short timeout — verification shouldn't tolerate slow servers.
      signal: AbortSignal.timeout(8_000),
      headers: { accept: 'text/plain' },
    });
    if (!res.ok) return false;
    const body = (await res.text()).trim();
    return body === token;
  } catch {
    return false;
  }
}

// ── Re-export token format for the UI ────────────────────────────────────

/** Format the user copies into their DNS provider. */
export function dnsTxtRecordValue(token: string): string {
  return `${TOKEN_PREFIX}${token}`;
}

/** URL the user must serve for well-known verification. */
export function wellKnownUrl(domain: string): string {
  return `https://${domain}/.well-known/oraclebot.txt`;
}
