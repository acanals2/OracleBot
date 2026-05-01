/**
 * Oracle Bot — database schema
 *
 * Single source of truth for all persistent data. Drizzle generates SQL
 * migrations from this file via `npm run db:generate`.
 *
 * Identity:
 *   - users   — synced from Clerk via webhook (one row per Clerk user)
 *   - orgs    — synced from Clerk Organizations (one row per workspace)
 *   - members — many-to-many between users and orgs
 *
 * Billing:
 *   - subscriptions — Stripe subscription state per org
 *   - usage_credits — pre-purchased per-run credits per org
 *
 * Runs:
 *   - runs        — top-level test run (one per "Run a test" click)
 *   - run_events  — append-only timeline (queued, started, progress, completed, etc.)
 *   - run_findings — issues surfaced by a run (the readiness report payload)
 *   - run_metrics — time-series metrics for charts (sampled during the run)
 *
 * Sharing:
 *   - share_links — public read-only tokens for run reports
 */
import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  uuid,
  pgEnum,
  uniqueIndex,
  index,
  real,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

export const orgRoleEnum = pgEnum('org_role', ['owner', 'admin', 'member']);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
]);

export const runModeEnum = pgEnum('run_mode', ['site', 'agent', 'api', 'stack']);

export const runStatusEnum = pgEnum('run_status', [
  'queued',
  'provisioning',
  'running',
  'completed',
  'failed',
  'canceled',
  'timed_out',
]);

export const runEventTypeEnum = pgEnum('run_event_type', [
  'queued',
  'provisioning_started',
  'provisioning_completed',
  'run_started',
  'progress',
  'finding_surfaced',
  'run_completed',
  'run_failed',
  'run_canceled',
  'run_timed_out',
]);

export const findingSeverityEnum = pgEnum('finding_severity', [
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

export const findingCategoryEnum = pgEnum('finding_category', [
  'race_condition',
  'load_ceiling',
  'auth_gap',
  'malformed_input',
  'rate_limit_gap',
  'prompt_injection',
  'hallucination',
  'jailbreak',
  'system_prompt_leak',
  'off_topic_drift',
  'integration_bug',
  'cost_runaway',
  'latency_cascade',
  'state_drift',
  'other',
]);

// ────────────────────────────────────────────────────────────────────────────
// Identity
// ────────────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkUserId: text('clerk_user_id').notNull().unique(),
    email: text('email').notNull(),
    name: text('name'),
    imageUrl: text('image_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clerkIdx: uniqueIndex('users_clerk_user_id_idx').on(t.clerkUserId),
    emailIdx: index('users_email_idx').on(t.email),
  }),
);

export const orgs = pgTable(
  'orgs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clerkOrgId: text('clerk_org_id').notNull().unique(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    imageUrl: text('image_url'),
    stripeCustomerId: text('stripe_customer_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    clerkIdx: uniqueIndex('orgs_clerk_org_id_idx').on(t.clerkOrgId),
    stripeIdx: index('orgs_stripe_customer_id_idx').on(t.stripeCustomerId),
  }),
);

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex('members_org_user_idx').on(t.orgId, t.userId),
    orgIdx: index('members_org_idx').on(t.orgId),
    userIdx: index('members_user_idx').on(t.userId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Billing
// ────────────────────────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
    stripePriceId: text('stripe_price_id').notNull(),
    productKey: text('product_key').notNull(), // 'studio' | 'stack' — maps to lib/billing.ts catalog
    status: subscriptionStatusEnum('status').notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('subscriptions_org_idx').on(t.orgId),
  }),
);

/**
 * Pre-purchased per-run credits (e.g. someone buys a Builder run for $149,
 * we add 1 credit. When they launch a run, we decrement by 1.)
 * For metered overage, we record usage on the run itself and bill via Stripe Meters.
 */
export const usageCredits = pgTable(
  'usage_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    productKey: text('product_key').notNull(), // 'scout' | 'builder'
    creditsRemaining: integer('credits_remaining').notNull().default(0),
    creditsPurchased: integer('credits_purchased').notNull().default(0),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('usage_credits_org_idx').on(t.orgId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Runs
// ────────────────────────────────────────────────────────────────────────────

export const runs = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),

    // Mode + configuration
    mode: runModeEnum('mode').notNull(),
    name: text('name').notNull(),

    // Target — exactly one of these populated depending on connection method
    targetRepoUrl: text('target_repo_url'), // GitHub repo URL
    targetCommitSha: text('target_commit_sha'), // pinned commit at run time
    targetDockerImage: text('target_docker_image'), // pre-built image
    targetLiveUrl: text('target_live_url'), // for authorized live URL mode
    targetAgentEndpoint: text('target_agent_endpoint'), // chatbot URL for Agent Mode

    // Configuration
    botCount: integer('bot_count').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    intentMix: jsonb('intent_mix').$type<{
      friendly?: number;
      adversarial?: number;
      confused?: number;
      hostile?: number;
    }>(),
    personaMix: jsonb('persona_mix').$type<{ archetype: string; weight: number }[]>(),
    scenarioIds: text('scenario_ids').array(),

    // Lifecycle
    status: runStatusEnum('status').notNull().default('queued'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // Results
    readinessScore: integer('readiness_score'), // 0-100
    summaryJson: jsonb('summary_json').$type<{
      site?: number;
      agent?: number;
      api?: number;
      stack?: number;
      [k: string]: unknown;
    }>(),

    // Tier the user picked. Worker reads this to attribute credit consumption
    // on completion (Phase 4).
    productKey: text('product_key'),

    // Cost tracking
    costCentsEstimated: integer('cost_cents_estimated'),
    costCentsActual: integer('cost_cents_actual'),
    hardCapCents: integer('hard_cap_cents'),

    // Idempotency for client-side retry safety
    idempotencyKey: text('idempotency_key'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('runs_org_idx').on(t.orgId),
    statusIdx: index('runs_status_idx').on(t.status),
    createdAtIdx: index('runs_created_at_idx').on(t.createdAt),
    idempotencyIdx: uniqueIndex('runs_idempotency_idx').on(t.orgId, t.idempotencyKey),
  }),
);

export const runEvents = pgTable(
  'run_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    type: runEventTypeEnum('type').notNull(),
    message: text('message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    runIdx: index('run_events_run_idx').on(t.runId, t.createdAt),
  }),
);

export const runFindings = pgTable(
  'run_findings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    severity: findingSeverityEnum('severity').notNull(),
    category: findingCategoryEnum('category').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    /** Concrete reproduction steps + impacted file/endpoint/persona */
    reproJson: jsonb('repro_json').$type<{
      steps?: string[];
      impactedPath?: string;
      affectedPersonas?: string[];
      transcript?: { role: 'user' | 'agent'; content: string }[];
      [k: string]: unknown;
    }>(),
    /** Pre-computed remediation suggestion text (Claude can fill this) */
    remediation: text('remediation'),
    /** AI-fix link if a patch has been generated */
    fixPullRequestUrl: text('fix_pull_request_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index('run_findings_run_idx').on(t.runId),
    sevIdx: index('run_findings_severity_idx').on(t.runId, t.severity),
  }),
);

export const runMetrics = pgTable(
  'run_metrics',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    /** seconds since run start */
    tSeconds: integer('t_seconds').notNull(),
    activeBots: integer('active_bots'),
    rps: real('rps'),
    p50Ms: real('p50_ms'),
    p95Ms: real('p95_ms'),
    p99Ms: real('p99_ms'),
    errorRate: real('error_rate'),
    /** Optional mode-specific metric — e.g., agent injection_rate, stack ai_cost_cents */
    extras: jsonb('extras').$type<Record<string, number>>(),
  },
  (t) => ({
    runTIdx: index('run_metrics_run_t_idx').on(t.runId, t.tSeconds),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Sharing
// ────────────────────────────────────────────────────────────────────────────

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(), // url-safe random
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('share_links_token_idx').on(t.token),
    runIdx: index('share_links_run_idx').on(t.runId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Dead-letter queue (mirrors platform/lib/db/schema.ts)
// ────────────────────────────────────────────────────────────────────────────

export const deadJobs = pgTable(
  'dead_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    queue: text('queue').notNull(),
    jobName: text('job_name').notNull(),
    jobId: text('job_id').notNull(),
    payload: jsonb('payload').notNull(),
    failedReason: text('failed_reason'),
    stack: text('stack'),
    attemptsMade: integer('attempts_made').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    queueIdx: index('dead_jobs_queue_idx').on(t.queue, t.createdAt),
    createdAtIdx: index('dead_jobs_created_at_idx').on(t.createdAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Relations
// ────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(members),
  runsCreated: many(runs),
  shareLinksCreated: many(shareLinks),
}));

export const orgsRelations = relations(orgs, ({ many }) => ({
  members: many(members),
  subscriptions: many(subscriptions),
  usageCredits: many(usageCredits),
  runs: many(runs),
}));

export const membersRelations = relations(members, ({ one }) => ({
  org: one(orgs, { fields: [members.orgId], references: [orgs.id] }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  org: one(orgs, { fields: [subscriptions.orgId], references: [orgs.id] }),
}));

export const usageCreditsRelations = relations(usageCredits, ({ one }) => ({
  org: one(orgs, { fields: [usageCredits.orgId], references: [orgs.id] }),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  org: one(orgs, { fields: [runs.orgId], references: [orgs.id] }),
  createdBy: one(users, { fields: [runs.createdByUserId], references: [users.id] }),
  events: many(runEvents),
  findings: many(runFindings),
  metrics: many(runMetrics),
  shareLinks: many(shareLinks),
}));

export const runEventsRelations = relations(runEvents, ({ one }) => ({
  run: one(runs, { fields: [runEvents.runId], references: [runs.id] }),
}));

export const runFindingsRelations = relations(runFindings, ({ one }) => ({
  run: one(runs, { fields: [runFindings.runId], references: [runs.id] }),
}));

export const runMetricsRelations = relations(runMetrics, ({ one }) => ({
  run: one(runs, { fields: [runMetrics.runId], references: [runs.id] }),
}));

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  run: one(runs, { fields: [shareLinks.runId], references: [runs.id] }),
  createdBy: one(users, { fields: [shareLinks.createdByUserId], references: [users.id] }),
}));

// ────────────────────────────────────────────────────────────────────────────
// Inferred types (use these everywhere, not raw table types)
// ────────────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type Member = typeof members.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type UsageCredit = typeof usageCredits.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type RunEvent = typeof runEvents.$inferSelect;
export type RunFinding = typeof runFindings.$inferSelect;
export type RunMetric = typeof runMetrics.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type DeadJob = typeof deadJobs.$inferSelect;
export type NewDeadJob = typeof deadJobs.$inferInsert;
