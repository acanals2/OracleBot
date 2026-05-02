/**
 * Public readiness badge — Phase 14.
 *
 * Resolves a verification id into a badge state by joining the verified
 * domain against the latest completed run for the same org. Anti-gaming
 * rules live here:
 *
 *   - Verification must be `verified` and not expired
 *   - We always read the LATEST completed run, not the best-ever
 *   - A 14-day freshness window forces re-scans; 30 days → "expired"
 *
 * Both the SVG endpoint (/api/badge/[id]) and the public score page
 * (/score/[id]) share this resolver so the displayed numbers stay
 * consistent across surfaces.
 */
import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { runs, targetVerifications, type Run, type TargetVerification } from './db/schema';

/** A run is "fresh" if it completed within this window. */
export const FRESH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** Beyond this window, the badge degrades to "expired". */
export const EXPIRED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type BadgeState =
  | { kind: 'unverified'; reason: 'not_found' | 'pending' | 'failed' | 'expired' }
  | { kind: 'no_runs'; verification: TargetVerification }
  | {
      kind: 'fresh';
      verification: TargetVerification;
      run: Run;
      score: number;
      ageMs: number;
    }
  | {
      kind: 'stale';
      verification: TargetVerification;
      run: Run;
      score: number;
      ageMs: number;
    }
  | {
      kind: 'expired_run';
      verification: TargetVerification;
      run: Run;
      score: number;
      ageMs: number;
    };

/**
 * Resolve a verification id into the data needed to render a badge or
 * score page. Pure — no side effects, no caching. Callers add their own
 * HTTP cache headers.
 */
export async function resolveBadge(verificationId: string): Promise<BadgeState> {
  // Step 1 — fetch the verification.
  const verification = await db.query.targetVerifications.findFirst({
    where: eq(targetVerifications.id, verificationId),
  });
  if (!verification) return { kind: 'unverified', reason: 'not_found' };
  if (verification.status === 'pending') return { kind: 'unverified', reason: 'pending' };
  if (verification.status === 'failed') return { kind: 'unverified', reason: 'failed' };
  if (verification.status === 'expired') return { kind: 'unverified', reason: 'expired' };
  // Belt-and-braces: a verified row past its expiresAt should also degrade.
  if (verification.expiresAt && verification.expiresAt.getTime() < Date.now()) {
    return { kind: 'unverified', reason: 'expired' };
  }

  // Step 2 — find the latest completed run for the same org whose target
  // domain matches the verified domain. We can't filter by domain in SQL
  // cleanly because run targets are full URLs and verifications are hostnames,
  // so we pull the most recent N completed runs and match in JS. N=20 is
  // plenty for any active org and keeps the query O(small).
  const candidates = await db
    .select()
    .from(runs)
    .where(and(eq(runs.orgId, verification.orgId), eq(runs.status, 'completed')))
    .orderBy(desc(runs.completedAt))
    .limit(20);

  const matched = candidates.find((r) => runMatchesDomain(r, verification.domain));
  if (!matched || matched.completedAt == null || matched.readinessScore == null) {
    return { kind: 'no_runs', verification };
  }

  const ageMs = Date.now() - matched.completedAt.getTime();
  const score = matched.readinessScore;

  if (ageMs <= FRESH_WINDOW_MS) {
    return { kind: 'fresh', verification, run: matched, score, ageMs };
  }
  if (ageMs <= EXPIRED_WINDOW_MS) {
    return { kind: 'stale', verification, run: matched, score, ageMs };
  }
  return { kind: 'expired_run', verification, run: matched, score, ageMs };
}

/** True if the run's target URL hostname matches the given domain (case-insensitive). */
export function runMatchesDomain(run: Run, domain: string): boolean {
  const target = run.targetLiveUrl ?? run.targetAgentEndpoint;
  if (!target) return false;
  let host: string;
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === domain.toLowerCase();
}

/**
 * For a given run, find the verification id (if any) whose verified domain
 * matches the run's target URL hostname. Used by the results page to render
 * the "Publish your score" card with a working badge URL.
 */
export async function verificationIdForRun(run: Run): Promise<string | null> {
  const target = run.targetLiveUrl ?? run.targetAgentEndpoint;
  if (!target) return null;
  let host: string;
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    return null;
  }
  const v = await db.query.targetVerifications.findFirst({
    where: and(
      eq(targetVerifications.orgId, run.orgId),
      eq(targetVerifications.domain, host),
      eq(targetVerifications.status, 'verified'),
    ),
  });
  return v?.id ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Display helpers (used by both SVG and HTML surfaces)
// ────────────────────────────────────────────────────────────────────────────

export type BadgeColor = 'green' | 'yellow' | 'red' | 'gray';

export function colorForScore(score: number): BadgeColor {
  if (score >= 90) return 'green';
  if (score >= 70) return 'yellow';
  return 'red';
}

export function gradeForScore(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** Human-readable "n days ago" / "today" / "yesterday". */
export function ageLabel(ms: number): string {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Reduce a BadgeState into the minimal struct an SVG renderer needs.
 * Keeps the SVG template free of branching on the discriminated union.
 */
export interface BadgeDisplay {
  /** Right-side text (the score, or a status word). */
  rightText: string;
  /** Color of the right-side block. */
  color: BadgeColor;
  /** Optional secondary line (e.g. "A · 3d ago"). */
  subText?: string;
}

export function displayFor(state: BadgeState): BadgeDisplay {
  switch (state.kind) {
    case 'unverified':
      return { rightText: 'unverified', color: 'gray' };
    case 'no_runs':
      return { rightText: 'no runs', color: 'gray' };
    case 'fresh':
      return {
        rightText: String(state.score),
        color: colorForScore(state.score),
        subText: `${gradeForScore(state.score)} · ${ageLabel(state.ageMs)}`,
      };
    case 'stale':
      return {
        rightText: `${state.score} stale`,
        color: 'gray',
        subText: ageLabel(state.ageMs),
      };
    case 'expired_run':
      return { rightText: 'expired', color: 'gray', subText: ageLabel(state.ageMs) };
  }
}
