/**
 * Oracle Bot — database schema
 *
 * Single source of truth for all persistent data. Drizzle generates SQL
 * migrations from this file via `npm run db:generate`.
 *
 * Identity (managed by Better Auth — see lib/auth-config.ts):
 *   - users          — one row per signed-up user (Better Auth + our extensions)
 *   - sessions       — active login sessions; rotated, server-side revocable
 *   - accounts       — credential / OAuth provider records per user
 *   - verifications  — email-verification + reset tokens
 *
 * Tenancy:
 *   - orgs        — one row per workspace/team
 *   - members     — many-to-many between users and orgs (with role)
 *   - invitations — pending org invites (email + role + status)
 *
 * Billing:
 *   - subscriptions — Stripe subscription state per org
 *   - usage_credits — pre-purchased per-run credits per org
 *
 * Runs:
 *   - runs         — top-level test run (one per "Run a test" click)
 *   - run_events   — append-only timeline (queued, started, progress, completed, etc.)
 *   - run_findings — issues surfaced by a run (the readiness report payload)
 *   - run_metrics  — time-series metrics for charts (sampled during the run)
 *
 * Sharing:
 *   - share_links  — public read-only tokens for run reports
 *
 * Workspaces:
 *   - workspaces   — codebase preview surfaces (files live on disk, not in DB)
 *
 * NOTE on column naming: Better Auth's Drizzle adapter expects specific column
 * names for the tables it manages (users, sessions, accounts, verifications,
 * orgs, members, invitations). The ones it cares about are noted inline; the
 * rest are ours to name freely.
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

export const verificationMethodEnum = pgEnum('verification_method', [
  'dns_txt',
  'well_known_file',
]);

export const verificationStatusEnum = pgEnum('verification_status', [
  'pending',
  'verified',
  'failed',
  'expired',
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
  // Phase 10 — added for AI-built / LLM / MCP probe packs.
  'exposed_secret',
  'missing_rls',
  'client_key_leak',
  'tool_poisoning',
  'pii_echo',
  'schema_violation',
  'capability_escalation',
  'credential_in_tool_desc',
]);

// ────────────────────────────────────────────────────────────────────────────
// Identity (Better Auth — core tables)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Better Auth `user` table. Field names match Better Auth's expectations
 * (id text, email, emailVerified, name, image, createdAt, updatedAt).
 * We keep `id` as text — Better Auth generates IDs that aren't UUIDs by default.
 */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    name: text('name').notNull(),
    image: text('image'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
  }),
);

/**
 * Better Auth `session` table. The current active org is stored here so
 * `<OrganizationSwitcher>`-style UI doesn't need a separate cookie.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    activeOrganizationId: text('active_organization_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('sessions_token_idx').on(t.token),
    userIdx: index('sessions_user_idx').on(t.userId),
    expiresIdx: index('sessions_expires_idx').on(t.expiresAt),
  }),
);

/**
 * Better Auth `account` table. One row per credential or OAuth provider.
 * Email/password users get a row with providerId='credential' and a hashed
 * password. OAuth users get one row per linked provider.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(), // provider-specific user id
    providerId: text('provider_id').notNull(), // 'credential' | 'google' | 'github' | ...
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'), // bcrypt hash (credential provider only)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('accounts_user_idx').on(t.userId),
    providerLookup: uniqueIndex('accounts_provider_lookup_idx').on(t.providerId, t.accountId),
  }),
);

/**
 * Better Auth `verification` table. Used for email verification tokens,
 * password-reset tokens, magic links — anything ephemeral with an identifier.
 */
export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    identifierIdx: index('verifications_identifier_idx').on(t.identifier),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Tenancy (Better Auth organization plugin)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Better Auth `organization` table. We name our table `orgs` (the project
 * has called it that since day one) and tell the adapter via field mapping.
 * Extension columns (stripeCustomerId) live alongside the BA-managed ones.
 */
export const orgs = pgTable(
  'orgs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    metadata: text('metadata'), // BA stores JSON-serialized strings here
    // Our extension column — keeps our Stripe customer mapping in the same row.
    stripeCustomerId: text('stripe_customer_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex('orgs_slug_idx').on(t.slug),
    stripeIdx: index('orgs_stripe_customer_id_idx').on(t.stripeCustomerId),
  }),
);

/**
 * Better Auth `member` table. Links users to orgs with a role. Better Auth's
 * default roles are 'member' / 'admin' / 'owner' as plain strings — we keep
 * a text column rather than a pgEnum so we can add custom roles later
 * without a migration dance.
 */
export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: uniqueIndex('members_org_user_idx').on(t.organizationId, t.userId),
    orgIdx: index('members_org_idx').on(t.organizationId),
    userIdx: index('members_user_idx').on(t.userId),
  }),
);

/**
 * Better Auth `invitation` table. Pending invites to join an org by email.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').notNull().default('pending'),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    orgEmailIdx: index('invitations_org_email_idx').on(t.organizationId, t.email),
    statusIdx: index('invitations_status_idx').on(t.status),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Billing
// ────────────────────────────────────────────────────────────────────────────

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
    stripePriceId: text('stripe_price_id').notNull(),
    productKey: text('product_key').notNull(),
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

export const usageCredits = pgTable(
  'usage_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    productKey: text('product_key').notNull(),
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
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),

    mode: runModeEnum('mode').notNull(),
    name: text('name').notNull(),

    /**
     * Probe pack ids selected for this run (Phase 10).
     *
     * Nullable for backward compatibility — runs created before pack
     * selection was added behave as if `['web_classics']` was chosen.
     * The `mode` column stays the source of truth for engine routing
     * until pack-based selection is fully wired through the worker.
     */
    packs: jsonb('packs').$type<string[]>(),

    targetRepoUrl: text('target_repo_url'),
    targetCommitSha: text('target_commit_sha'),
    targetDockerImage: text('target_docker_image'),
    targetLiveUrl: text('target_live_url'),
    targetAgentEndpoint: text('target_agent_endpoint'),

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

    status: runStatusEnum('status').notNull().default('queued'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    readinessScore: integer('readiness_score'),
    summaryJson: jsonb('summary_json').$type<{
      site?: number;
      agent?: number;
      api?: number;
      stack?: number;
      [k: string]: unknown;
    }>(),

    /** Tier the user picked (free, scout, builder, studio, stack). Used for
     *  entitlement checks + free-tier monthly counter. */
    productKey: text('product_key'),

    costCentsEstimated: integer('cost_cents_estimated'),
    costCentsActual: integer('cost_cents_actual'),
    hardCapCents: integer('hard_cap_cents'),

    idempotencyKey: text('idempotency_key'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('runs_org_idx').on(t.orgId),
    statusIdx: index('runs_status_idx').on(t.status),
    createdAtIdx: index('runs_created_at_idx').on(t.createdAt),
    idempotencyIdx: uniqueIndex('runs_idempotency_idx').on(t.orgId, t.idempotencyKey),
    /** Lookup index for the free-tier monthly counter. */
    orgProductCreatedIdx: index('runs_org_product_created_idx').on(
      t.orgId,
      t.productKey,
      t.createdAt,
    ),
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
    /**
     * Probe id that produced this finding (Phase 10). Nullable for
     * backward compatibility with findings recorded before the probe
     * registry existed; resolves to a `web_classics` probe in those
     * cases via the application layer.
     */
    probeId: text('probe_id'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    reproJson: jsonb('repro_json').$type<{
      steps?: string[];
      impactedPath?: string;
      affectedPersonas?: string[];
      transcript?: { role: 'user' | 'agent'; content: string }[];
      [k: string]: unknown;
    }>(),
    remediation: text('remediation'),
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
    tSeconds: integer('t_seconds').notNull(),
    activeBots: integer('active_bots'),
    rps: real('rps'),
    p50Ms: real('p50_ms'),
    p95Ms: real('p95_ms'),
    p99Ms: real('p99_ms'),
    errorRate: real('error_rate'),
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
    token: text('token').notNull().unique(),
    createdByUserId: text('created_by_user_id')
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
// Target / domain verification
//
// Before a run can target an external domain, the requesting org must prove
// it owns that domain. Two verification methods are supported:
//   - dns_txt: org adds `oracle-bot-verify=<token>` as a TXT record at the
//     apex (or a subdomain prefix) and we resolve it.
//   - well_known_file: org serves a plain-text file at
//     `https://<domain>/.well-known/oraclebot.txt` whose body is `<token>`.
//
// One row per (org, domain). Verification persists for 90 days; after that
// the org must re-verify. A handful of domains are carved out at the
// application layer (see lib/target-verification.ts) and skip this table.
// ────────────────────────────────────────────────────────────────────────────

export const targetVerifications = pgTable(
  'target_verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** Hostname only — lowercased, no scheme/path/port. */
    domain: text('domain').notNull(),
    /** Random opaque token the org must surface via DNS or HTTP. */
    challengeToken: text('challenge_token').notNull(),
    method: verificationMethodEnum('method').notNull(),
    status: verificationStatusEnum('status').notNull().default('pending'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /** When the verification expires and the org must re-verify. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Last attempt timestamp + error reason if any. */
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgDomainIdx: uniqueIndex('target_verifications_org_domain_idx').on(t.orgId, t.domain),
    statusIdx: index('target_verifications_status_idx').on(t.status),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Stripe webhook idempotency
//
// Every Stripe webhook event has a unique `event.id` (e.g. evt_1Abc…). We
// insert into this table on receipt; the unique PRIMARY KEY constraint
// prevents duplicate processing if Stripe replays the event (which it does
// on any non-2xx response, plus any client can replay via `stripe events
// resend evt_…`). Handlers stamp `processedAt` when they finish; if they
// throw, `error` records the reason so the row can be cleared and retried.
// ────────────────────────────────────────────────────────────────────────────

export const webhookEvents = pgTable(
  'webhook_events',
  {
    /** Stripe event.id (e.g. evt_1Abc...). PRIMARY KEY = idempotency lock. */
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    typeIdx: index('webhook_events_type_idx').on(t.type, t.receivedAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Dead-letter queue
//
// BullMQ jobs that exhaust their retry attempts are persisted here so they're
// inspectable from the admin UI and don't disappear when Redis is wiped.
// One row per dead job; queries filter by `queue` to scope per worker pool.
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
// Workspaces (codebase preview surface)
// ────────────────────────────────────────────────────────────────────────────

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    basedOnRunId: uuid('based_on_run_id').references(() => runs.id, { onDelete: 'set null' }),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('workspaces_org_idx').on(t.orgId),
    ownerIdx: index('workspaces_owner_idx').on(t.ownerUserId),
  }),
);

/**
 * Codegen webhook subscriptions — Phase 18.
 *
 * Maps a deploy event from an external codegen platform (Lovable, v0, Bolt,
 * Replit Agent) to an OracleBot org + scan config. Created via the Settings
 * → Integrations UI; consulted by /api/integrations/<platform>/deploy on
 * every incoming webhook.
 *
 * The `externalProjectId` is whatever the platform calls its project — a
 * UUID for Lovable, a slug for v0, etc. It IS the lookup key, so it must
 * match exactly what the platform sends.
 *
 * `secret` is the shared-secret the platform signs its payloads with,
 * stored at-rest. Rotated via the Settings UI.
 */
export const webhookPlatformEnum = pgEnum('webhook_platform', [
  'lovable',
  'v0',
  'bolt',
  'replit_agent',
  'generic',
]);

export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    platform: webhookPlatformEnum('platform').notNull(),
    /** Platform-specific project identifier (UUID/slug/etc). */
    externalProjectId: text('external_project_id').notNull(),
    /** Friendly label for the Settings UI. */
    label: text('label').notNull(),
    /** Shared secret used to verify signatures. Stored at rest. */
    secret: text('secret').notNull(),
    /** Probe packs to run on every triggered scan. */
    packs: jsonb('packs').$type<string[]>().notNull(),
    /** Tier the run is billed against. */
    productKey: text('product_key').notNull(),
    /** Min score below which the platform is sent a failure callback. Optional. */
    minScore: integer('min_score'),
    /** Bound to a verified target — if null, scan derives URL from payload. */
    targetVerificationId: uuid('target_verification_id').references(
      () => targetVerifications.id,
      { onDelete: 'set null' },
    ),
    /** Set false to pause without deleting the row. */
    enabled: boolean('enabled').notNull().default(true),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('webhook_subscriptions_org_idx').on(t.orgId),
    platformProjectIdx: uniqueIndex('webhook_subscriptions_platform_project_idx').on(
      t.platform,
      t.externalProjectId,
    ),
  }),
);

/**
 * API tokens — Phase 17 (GitHub Action + CI integrations).
 *
 * An API token is org-scoped, attributed to a creating user, and bears the
 * creator's role. It carries no separate role of its own — Better Auth's
 * authorisation logic still routes through the user/org/role triple. Tokens
 * authenticate `Authorization: Bearer obt_<32 chars>` requests to /api/runs
 * etc. without a session cookie.
 *
 * Privacy: we never store the raw token. The `tokenHash` column holds a
 * SHA-256 hex digest of `<token>+<INTERNAL_API_SECRET>`. Lookups happen by
 * hash; the raw token is shown to the user once at creation and never again.
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    /** User who created the token. Role is inherited at request time. */
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    /** Human-friendly label (e.g. "GitHub Action - my-org/my-repo"). */
    name: text('name').notNull(),
    /** First 8 chars of the raw token (e.g. "obt_a1b2") — shown in the UI. */
    tokenPrefix: text('token_prefix').notNull(),
    /** SHA-256 hex digest of `<token>+<INTERNAL_API_SECRET>`. */
    tokenHash: text('token_hash').notNull(),
    /** Optional expiry; null = no expiry. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Last time the token successfully authenticated a request. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    /** Manual revocation — sets revokedAt; lookups must filter on this. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('api_tokens_org_idx').on(t.orgId),
    hashIdx: uniqueIndex('api_tokens_hash_idx').on(t.tokenHash),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Relations
// ────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  memberships: many(members),
  runsCreated: many(runs),
  shareLinksCreated: many(shareLinks),
  workspacesOwned: many(workspaces),
  invitationsSent: many(invitations),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const orgsRelations = relations(orgs, ({ many }) => ({
  members: many(members),
  invitations: many(invitations),
  subscriptions: many(subscriptions),
  usageCredits: many(usageCredits),
  runs: many(runs),
  workspaces: many(workspaces),
}));

export const membersRelations = relations(members, ({ one }) => ({
  org: one(orgs, { fields: [members.organizationId], references: [orgs.id] }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  org: one(orgs, { fields: [invitations.organizationId], references: [orgs.id] }),
  inviter: one(users, { fields: [invitations.inviterId], references: [users.id] }),
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

export const workspacesRelations = relations(workspaces, ({ one }) => ({
  org: one(orgs, { fields: [workspaces.orgId], references: [orgs.id] }),
  owner: one(users, { fields: [workspaces.ownerUserId], references: [users.id] }),
  basedOnRun: one(runs, { fields: [workspaces.basedOnRunId], references: [runs.id] }),
}));

// ────────────────────────────────────────────────────────────────────────────
// Inferred types
// ────────────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Verification = typeof verifications.$inferSelect;
export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
export type Member = typeof members.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type UsageCredit = typeof usageCredits.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type RunEvent = typeof runEvents.$inferSelect;
export type RunFinding = typeof runFindings.$inferSelect;
export type RunMetric = typeof runMetrics.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type DeadJob = typeof deadJobs.$inferSelect;
export type NewDeadJob = typeof deadJobs.$inferInsert;
export type TargetVerification = typeof targetVerifications.$inferSelect;
export type NewTargetVerification = typeof targetVerifications.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;
export type NewWebhookSubscription = typeof webhookSubscriptions.$inferInsert;
