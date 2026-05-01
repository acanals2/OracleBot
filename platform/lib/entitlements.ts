/**
 * Entitlements — single source of truth for "what is this org allowed to do
 * right now?" Read by run creation, by the wizard tier picker, and by the
 * billing page.
 *
 * Inputs (all read fresh from DB):
 *   - subscriptions: any active or trialing row for the org
 *   - usageCredits: per-product credit balances
 *   - runs (this calendar month, productKey='free'): free-tier counter
 *
 * Output: a single Entitlements object summarizing what the org can do and,
 * if blocked, why. The wizard surfaces `blockedReason` inline; the run-
 * creation API throws ForbiddenError carrying the same string.
 */
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from './db';
import {
  runs as runsTable,
  subscriptions as subscriptionsTable,
  usageCredits as usageCreditsTable,
  type Subscription,
} from './db/schema';
import { ForbiddenError } from './errors';
import { FREE_RUNS_PER_MONTH } from './billing';

export type Plan = 'free' | 'scout' | 'builder' | 'studio' | 'stack';

export interface Entitlements {
  /** Best plan currently active. 'free' if no sub + no credits. */
  plan: Plan;
  /** Active subscription row if any (status='active' or 'trialing'). */
  subscription: Subscription | null;
  /** Total credits across all credit products. */
  creditsRemaining: number;
  /** Per-product credit breakdown for UI display. */
  creditsByProduct: Record<string, number>;
  /** Free-tier runs remaining this calendar month. */
  freeRunsRemaining: number;
  /** True iff `assertCanCreateRun` would succeed for SOME productKey. */
  canCreateAnyRun: boolean;
}

const SUBSCRIPTION_PLAN_KEYS: ReadonlySet<Plan> = new Set(['studio', 'stack']);
const CREDIT_PLAN_KEYS: ReadonlySet<Plan> = new Set(['scout', 'builder']);
const ACTIVE_SUB_STATUSES: ReadonlySet<Subscription['status']> = new Set([
  'active',
  'trialing',
]);

/**
 * Read the org's full entitlement state. Cheap (3 indexed queries).
 */
export async function getEntitlements(orgId: string): Promise<Entitlements> {
  const [activeSub, credits, freeUsed] = await Promise.all([
    db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptionsTable.orgId, orgId),
        // Note: in('status', [...]) — use sql for cleanliness.
        sql`${subscriptionsTable.status} in ('active', 'trialing')`,
      ),
      orderBy: (s, { desc }) => [desc(s.currentPeriodEnd)],
    }),
    db.query.usageCredits.findMany({
      where: eq(usageCreditsTable.orgId, orgId),
    }),
    countFreeRunsThisMonth(orgId),
  ]);

  const creditsByProduct: Record<string, number> = {};
  let creditsRemaining = 0;
  for (const c of credits) {
    creditsByProduct[c.productKey] = (creditsByProduct[c.productKey] ?? 0) + c.creditsRemaining;
    creditsRemaining += c.creditsRemaining;
  }

  const freeRunsRemaining = Math.max(0, FREE_RUNS_PER_MONTH - freeUsed);

  let plan: Plan = 'free';
  if (activeSub && SUBSCRIPTION_PLAN_KEYS.has(activeSub.productKey as Plan)) {
    plan = activeSub.productKey as Plan;
  } else if (creditsRemaining > 0) {
    // Pick the highest-tier credit product the org has.
    if (creditsByProduct['builder'] && creditsByProduct['builder'] > 0) plan = 'builder';
    else if (creditsByProduct['scout'] && creditsByProduct['scout'] > 0) plan = 'scout';
  }

  const canCreateAnyRun =
    !!activeSub || creditsRemaining > 0 || freeRunsRemaining > 0;

  return {
    plan,
    subscription: activeSub ?? null,
    creditsRemaining,
    creditsByProduct,
    freeRunsRemaining,
    canCreateAnyRun,
  };
}

/**
 * Throw ForbiddenError if the org cannot create a run with the given
 * productKey. Called from POST /api/runs after Phase-3 domain verification.
 *
 * Order of checks (first match wins):
 *   1. Active subscription whose productKey covers the requested productKey
 *   2. usageCredits row for the requested productKey with creditsRemaining > 0
 *   3. productKey === 'free' AND freeRunsRemaining > 0
 *   4. Otherwise → block with a human-readable reason
 */
export async function assertCanCreateRun(
  orgId: string,
  opts: { productKey: string; costCentsEstimated: number },
  traceId?: string,
): Promise<void> {
  const ent = await getEntitlements(orgId);

  // 1. Subscription path — covers every productKey while active.
  if (ent.subscription && ACTIVE_SUB_STATUSES.has(ent.subscription.status)) {
    return;
  }

  // 2. Credit path — must have a credit for the SAME productKey.
  if (CREDIT_PLAN_KEYS.has(opts.productKey as Plan)) {
    const remaining = ent.creditsByProduct[opts.productKey] ?? 0;
    if (remaining > 0) return;
  }

  // 3. Free-tier path.
  if (opts.productKey === 'free' && ent.freeRunsRemaining > 0) {
    return;
  }

  // 4. Block.
  const reason = buildBlockedReason(ent, opts.productKey);
  throw new ForbiddenError(reason, { plan: ent.plan, productKey: opts.productKey }, traceId);
}

function buildBlockedReason(ent: Entitlements, productKey: string): string {
  if (productKey === 'free') {
    return `You've used your ${FREE_RUNS_PER_MONTH} free runs this month. Buy a credit or subscribe to keep running.`;
  }
  if (CREDIT_PLAN_KEYS.has(productKey as Plan)) {
    return `No ${productKey} credits left. Buy one from the Billing page or upgrade to a subscription.`;
  }
  if (SUBSCRIPTION_PLAN_KEYS.has(productKey as Plan)) {
    return `No active ${productKey} subscription. Subscribe from the Billing page first.`;
  }
  return `Unknown plan "${productKey}". Pick free, scout, builder, studio, or stack.`;
}

/**
 * Atomically consume one credit for an org+productKey. Returns true if a
 * credit was consumed, false if no decrement happened (covered by sub or
 * free tier, or no credits available — the caller decides).
 *
 * Single conditional UPDATE: Postgres MVCC guarantees only one of two
 * concurrent calls succeeds even with the same starting state.
 */
export async function consumeCredit(
  orgId: string,
  productKey: string,
): Promise<{ consumed: boolean; reason: 'subscription' | 'free' | 'credit' | 'none' }> {
  // Subscription wins — no credit decrement.
  const activeSub = await db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptionsTable.orgId, orgId),
      sql`${subscriptionsTable.status} in ('active', 'trialing')`,
    ),
  });
  if (activeSub) return { consumed: false, reason: 'subscription' };

  // Free tier — no row to decrement; counter is computed from runs table.
  if (productKey === 'free') return { consumed: false, reason: 'free' };

  // Atomic decrement. Use a single UPDATE … WHERE creditsRemaining > 0
  // with RETURNING; if no row comes back, the org has no credits or two
  // calls raced and the other won.
  const updated = await db
    .update(usageCreditsTable)
    .set({
      creditsRemaining: sql`${usageCreditsTable.creditsRemaining} - 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(usageCreditsTable.orgId, orgId),
        eq(usageCreditsTable.productKey, productKey),
        sql`${usageCreditsTable.creditsRemaining} > 0`,
      ),
    )
    .returning({ id: usageCreditsTable.id });

  if (updated.length > 0) return { consumed: true, reason: 'credit' };
  return { consumed: false, reason: 'none' };
}

// ── helpers ────────────────────────────────────────────────────────────────

async function countFreeRunsThisMonth(orgId: string): Promise<number> {
  const result = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(runsTable)
    .where(
      and(
        eq(runsTable.orgId, orgId),
        eq(runsTable.productKey, 'free'),
        gte(runsTable.createdAt, sql`date_trunc('month', now())`),
      ),
    );
  return result[0]?.n ?? 0;
}
