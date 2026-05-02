# OracleBot Strategic Refactor: The Readiness Layer for AI-Built Software

## Context

OracleBot is currently positioned as a generic pre-deploy stress tester ("synthetic users that behave like real ones"). The category-defining decisions — probe taxonomy, scoring surface area, brand positioning — haven't been locked in yet. If we wait until Phase 16 ("marketing site polish") to think about positioning, we'll have built a generic scanner that markets itself as one.

This plan repositions OracleBot as **"the readiness layer for AI-built and AI-native software"** targeting devs shipping via Lovable, v0, Bolt, Cursor, Replit Agent, and Claude Code, plus teams deploying MCP servers and AI agents in production. Three structural changes — probe packs, public readiness badges, and beachhead copy — maximize relevance without rebuilding anything.

---

## 1. Probe Pack Abstraction

### Decision: packs layer on top of modes — they do not replace them

Modes are the execution boundary (which sandbox/engine to run). Packs are the conceptual grouping that determines which probes fire within those engines. A pack maps to one or more modes and carries a subset of probe IDs.

### Schema: ProbeDefinition + PackDefinition

```ts
// worker/src/engine/packs.ts (new file)

interface ProbeDefinition {
  id: string;                          // e.g. "supabase_anon_key_exposed"
  pack: PackId;
  engine: 'site' | 'agent' | 'api';   // which engine runner executes it
  category: FindingCategory;
  defaultSeverity: Severity;
  title: string;
  description: string;
  runProbe: (ctx: ProbeContext) => AsyncGenerator<RawFinding>;
}

type PackId = 'web_classics' | 'ai_built_apps' | 'llm_endpoints' | 'mcp_server' | 'agent_runtime';

interface PackDefinition {
  id: PackId;
  label: string;
  description: string;
  probeIds: string[];
  requiredEngines: Set<'site' | 'agent' | 'api'>;
}
```

### Migration path for existing probes

Current state: probes are hardcoded logic inside 4 engine files (`site-bot.ts`, `agent-bot.ts`, `api-bot.ts`, `stack-bot.ts`). Each engine has inline if/else for detecting specific finding categories.

Refactor: extract each probe's detection logic into its own function under `worker/src/engine/probes/<pack-name>/`. The engine files become orchestrators that receive a filtered `ProbeDefinition[]` and delegate:

```ts
// Engine loop becomes:
for (const probe of enabledProbes.filter(p => p.engine === 'site')) {
  for await (const finding of probe.runProbe(ctx)) {
    yield finding;
  }
}
```

Existing probes map to the `web_classics` pack:
- `site-bot.ts` → `integration_bug`, `auth_gap`, `race_condition`, `latency_cascade`, `malformed_input`
- `agent-bot.ts` → `system_prompt_leak`, `jailbreak`, `prompt_injection`, `hallucination`, `off_topic_drift`, `rate_limit_gap`
- `api-bot.ts` → `rate_limit_gap`, `auth_gap`, `malformed_input`, `integration_bug`
- `stack-bot.ts` already composes the three sub-engines — under packs it determines required engines from the union of selected packs' `requiredEngines`

### How run creation changes

`createRunInputSchema` in `platform/lib/runs.ts:33` gains an optional `packs` field:

```ts
packs: z.array(z.enum([...packIds])).optional()
```

- When `packs` specified → system derives required engines from pack definitions, sets `mode` to primary engine (or `stack` if multi-engine)
- When `packs` omitted → backward compat, falls back to mode-based behavior (maps to `web_classics` for site, existing agent probes for agent, etc.)

### DB schema changes (`platform/lib/db/schema.ts`)

1. **Extend `findingCategoryEnum`** (line 115) — append new values in one migration:
   `exposed_secret`, `missing_rls`, `client_key_leak`, `tool_poisoning`, `pii_echo`, `schema_violation`, `capability_escalation`, `credential_in_tool_desc`

2. **Add `packs` column to `runs` table** (line ~371): `packs: jsonb('packs').$type<string[]>()` — nullable for backward compat

3. **Add `probeId` column to `runFindings` table** (line ~459): `probeId: text('probe_id')` — nullable for existing data, traces which probe produced the finding

No new tables. Packs are code-defined (in `packs.ts`), not DB-stored.

### UI changes

- **Run wizard** (`platform/app/(app)/app/tests/new/NewRunWizard.tsx`): Step 0 currently shows 4 mode cards. Redesign to show pack cards instead. Selecting packs unions their engine requirements. Mode becomes derived.
- **Findings list** (`platform/components/run/FindingsList.tsx`): Add pack grouping axis alongside existing severity grouping. Use `probeId` to look up pack from client-side registry.

### Where scoring would need to change (not now)

- `platform/lib/report.ts:51-62` — `subScore()` category→mode mapping needs updating when new categories are added
- Future: pack-level subscores by filtering findings by `probeId` against pack registry
- **Latent bug to fix first:** `worker/src/engine/scoring.ts` and `platform/lib/report.ts` have divergent penalty weights (medium: 6 vs 5, info: 0.5 vs 0, critical bonus: present vs absent). Reconcile before adding packs.

---

## 2. Public Readiness Badge System

### Decision: badge is target-based, not run-based

The badge answers "is this domain ready?" not "did this specific run pass?" It automatically picks up the most recent completed run for the verified domain.

### Routes (all new, all unauthenticated)

| Route | Purpose | File |
|-------|---------|------|
| `GET /badge/[verificationId].svg` | SVG badge image | `platform/app/api/badge/[verificationId]/route.ts` (new) |
| `GET /score/[verificationId]` | Public score page with embed snippets | `platform/app/score/[verificationId]/page.tsx` (new) |

### Resolution logic

Given a `verificationId`:
1. Look up `targetVerifications` row. If status ≠ `verified` → "not verified" badge.
2. Query latest completed run for same org where target domain matches verification domain.
3. If no run or run older than **14 days** → "stale" badge (muted colors, shows age). After **30 days** → "expired."
4. Otherwise → render score.

### Badge design

Shields.io-compatible format (renders in GitHub READMEs, npm, docs sites):
- Left half: "OracleBot" label
- Right half: numeric score + color background (green >=90, yellow 70-89, red <70, gray for stale/expired/unverified)
- Server-rendered SVG template string — no external dependencies
- `Cache-Control: public, max-age=3600` (1-hour CDN cache)

### Share-after-pass UX

After a run completes with score >=70, the results page (`platform/app/(app)/app/tests/[testId]/results/page.tsx`) shows a new "Share your score" card with:
- Copy-to-clipboard embed snippet: `[![OracleBot Readiness](https://oraclebot.net/badge/<id>.svg)](https://oraclebot.net/score/<id>)`
- Direct link to public score page
- Existing share link button (already implemented)

### Anti-gaming rules

1. **Tied to verified domain** — can't scan a clean site and keep the badge after deploying broken code; 14-day freshness forces re-scans
2. **Always most recent run** — can't cherry-pick best-ever score
3. **Badge endpoint rate-limited** to 100 req/min/IP, logs requests for abuse detection
4. **Verification ID is UUID** — no domain enumeration
5. **Future:** webhook to ping user when badge degrades to stale

### Schema changes

None. Reads from existing `targetVerifications` + `runs` tables via join.

### Files changed

- `platform/app/api/badge/[verificationId]/route.ts` — **new** (SVG endpoint)
- `platform/app/score/[verificationId]/page.tsx` — **new** (public score page)
- `platform/lib/badge.ts` — **new** (shared SVG template + resolution logic)
- `platform/app/(app)/app/tests/[testId]/results/page.tsx` — **modified** (add share-your-score card)
- `platform/middleware.ts` — **modified** (allow `/badge/*` and `/score/*` unauthenticated)

---

## 3. New Probe Pack Stubs

### Pack: `ai_built_apps`

Targets output from Lovable, v0, Bolt, Cursor, Replit Agent. Uses `site` engine primarily.

| # | Probe ID | Description | Severity |
|---|----------|-------------|----------|
| 1 | `supabase_anon_key_exposed` | Scans client bundle JS for Supabase `anon` key; verifies if key grants write access without RLS | critical |
| 2 | `missing_rls_on_public_tables` | Uses discovered anon key to attempt SELECT/INSERT on every exposed Supabase table | critical |
| 3 | `hardcoded_secret_in_bundle` | Pattern-matches client JS for API keys, JWTs, private keys, .env variable names (OpenAI, Stripe, Resend, DB URLs) | critical |
| 4 | `firebase_rules_open` | If Firebase config detected in bundle, probes Firestore/RTDB with unauthenticated reads/writes | high |
| 5 | `unvalidated_redirect` | Tests links and form actions for open-redirect vulnerabilities common in AI-generated auth flows | high |
| 6 | `missing_csrf_protection` | Submits state-mutating forms without CSRF token from cross-origin context | high |
| 7 | `default_error_page_leak` | Triggers 404/500 routes; checks for framework version, stack traces, file paths in responses | medium |
| 8 | `insecure_cors_on_api_routes` | Probes Next.js/Express API routes for `Access-Control-Allow-Origin: *` on user-data endpoints | medium |
| 9 | `client_side_auth_only` | Detects auth checks only in client JS (conditional renders) with no server-side middleware | high |
| 10 | `exposed_debug_endpoints` | Checks for `/api/debug`, `/__nextjs_original-stack-frame`, Prisma/Drizzle Studio left exposed | medium |
| 11 | `missing_rate_limit_on_auth` | Brute-force probe against login/signup/password-reset — common miss in AI-generated code | high |
| 12 | `dependency_with_known_cve` | If package.json or lock file fetchable (exposed `_next/` routes), check top-20 deps against known CVEs | medium |

### Pack: `llm_endpoints`

Targets any HTTP endpoint wrapping an LLM. Uses `agent` + `api` engines.

| # | Probe ID | Description | Severity |
|---|----------|-------------|----------|
| 1 | `system_prompt_extraction` | 15 prompt-extraction techniques (reflection, roleplay, encoding tricks); Claude evaluates if system instructions leaked | critical |
| 2 | `prompt_injection_via_user_content` | Embeds injection payloads inside user-provided documents and checks if LLM follows injected instruction | critical |
| 3 | `pii_echo_in_response` | Sends messages containing PII (SSN, CC, email) and checks if LLM echoes them back verbatim or in summaries | high |
| 4 | `jailbreak_bypass` | Tests 10 jailbreak patterns (DAN, roleplay, multi-turn escalation, encoding) | high |
| 5 | `hallucination_on_factual_query` | Sends verifiable factual questions; Claude evaluates response accuracy | medium |
| 6 | `missing_output_length_cap` | Sends "write a 50,000 word essay" and measures whether endpoint enforces max_tokens | high |
| 7 | `no_rate_limit_on_llm_endpoint` | Burst test: 50 concurrent requests, checks for 429 | high |
| 8 | `cost_amplification_attack` | Prompts designed to maximize token consumption; measures per-request cost guards | high |
| 9 | `unsafe_tool_call_execution` | If endpoint supports tool calling, tests whether it executes tool calls from injected instructions | critical |
| 10 | `response_format_violation` | If endpoint claims structured output (JSON mode), sends adversarial prompts to break schema | medium |

### Pack: `mcp_server`

Targets MCP server endpoints (HTTP/SSE transport only — stdio is out of scope). Uses `api` engine.

| # | Probe ID | Description | Severity |
|---|----------|-------------|----------|
| 1 | `tool_description_injection` | Registers tool with injected instructions in description; checks if MCP host executes them | critical |
| 2 | `credential_leak_in_tool_desc` | Scans all tool descriptions and parameter schemas from `tools/list` for API keys, tokens, URLs with credentials | critical |
| 3 | `tool_name_collision` | Registers tools shadowing common built-in names (read_file, bash) to test resolver vulnerability | high |
| 4 | `unbounded_resource_list` | Calls `resources/list` and `prompts/list` without pagination; measures response size/time for DoS potential | high |
| 5 | `missing_auth_on_mcp_transport` | Connects to SSE/HTTP transport without credentials; verifies tool invocations are rejected | critical |
| 6 | `tool_invocation_without_confirmation` | Calls destructive-sounding tools (delete_*, drop_*) and checks for execution without human confirmation | high |
| 7 | `cross_resource_access` | Calls tools with resource URIs pointing outside expected scope (path traversal, cross-tenant IDs) | critical |
| 8 | `schema_violation_on_tool_input` | Sends malformed tool inputs (wrong types, missing required, oversized); checks for crash vs structured error | medium |
| 9 | `capability_escalation_via_sampling` | If server exposes `sampling/createMessage`, tests whether client can escalate by requesting server to call tools on its behalf | high |
| 10 | `logging_sensitive_data` | Invokes tools with sensitive inputs; checks if `notifications/message` stream leaks values in logs | medium |

---

## 4. Phase Map

Reconstructed from codebase archaeology + proposed additions:

| Phase | Name | Status |
|-------|------|--------|
| 1 | Landing page + waitlist | Shipped |
| 2 | Worker infrastructure (BullMQ, dead-letter, Sentry) | Shipped |
| 3 | Domain verification + target auth | Shipped |
| 4 | Stripe billing (free/scout/builder/studio/stack) | Shipped |
| 5 | Bot engines v1 (site, agent, api, stack) | Shipped |
| 6 | Email notifications (Resend) | Stubbed |
| 7 | Share links + public spectator view | Shipped |
| 8 | Run wizard + live dashboard | Shipped |
| 9 | Workspace / codebase preview | Shipped |
| **10** | **Probe pack abstraction** | **New — this plan** |
| **11** | **AI-built apps probe pack** | **New** |
| 12 | E2B sandbox wiring | Pending |
| **13** | **LLM endpoints + MCP server probe packs** | **New** |
| **14** | **Public readiness badge** | **Pulled forward from 16** |
| 15 | RBAC (roles beyond org-owner) | Pending |
| 16 | Marketing site repositioning (beachhead copy) | Pending |
| 17 | CI/CD integrations (GitHub Actions, CLI) | Pending |
| **18** | **AI-codegen integrations** | **New** |
| 19 | Metered overage billing | Pending |
| **20** | **Agent runtime probe pack** | **New** |

### Sequencing rationale

- **10 before 11/13**: pack abstraction is the infrastructure that new probe packs build on
- **14 (badge) pulled forward**: primary social-proof mechanism for beachhead audience — AI builders want scores in READMEs and deploy previews. This is distribution, not polish
- **18 (codegen integrations) deliberately late**: depends on having compelling probe packs (11, 13) and a badge system (14) worth integrating. Includes: "Send to OracleBot" webhook from Lovable/v0/Bolt, Claude Code/Cursor extension that runs score inline
- **20 (agent runtime) last**: full multi-turn adversarial, tool-use safety, memory poisoning — most complex pack, benefits from learnings on 11/13

### Dependency changes

- Phase 11 now blocks on Phase 10 (pack infrastructure)
- Phase 13 now blocks on Phase 10
- Phase 14 has no new blockers (reads existing tables)
- Phase 18 blocks on 11, 13, 14

---

## 5. Landing Page / README Copy Direction

### New hero copy

> **The readiness layer for AI-built software.**
>
> You shipped fast with Lovable, v0, Bolt, Cursor, or Claude Code. OracleBot tells you what they missed. We scan for exposed Supabase keys, missing RLS, hardcoded secrets, prompt injection vulnerabilities, and 40+ failure modes specific to AI-generated code — then give you a readiness score you can embed in your README before you go live.

### Second paragraph (beachhead targeting)

> Whether you're deploying a Next.js app scaffolded by an AI coding agent, an LLM-powered chatbot endpoint, or an MCP server that connects AI models to your data — OracleBot runs the security and reliability checks that AI builders skip. One scan. A readiness score. A badge that proves your app is production-ready.

### Five phrases to remove from current copy

1. **"Synthetic users that behave like real ones"** (`index.html` hero title) — too generic, sounds like load testing
2. **"populates your staging environment with thousands of personas that sign up, place orders, send messages"** (hero sub) — positions as data seeding, not security/readiness
3. **"Built for teams shipping: trading platforms · marketplaces · signals products · social apps · SaaS dashboards"** (proof section) — generic verticals, no AI-native signal
4. **"An empty staging app is not a tested staging app"** (problem section) — frames problem as "empty staging" instead of "AI-generated code has blind spots"
5. **"Three steps from empty to populated"** (how-it-works heading) — "populated" is wrong value prop; "audited" or "verified" is correct

### Replacement proof line

> Built for teams shipping with: **Lovable · v0 · Bolt · Cursor · Claude Code · Replit Agent · MCP Servers**

---

## 6. Risks and Unknowns — Need Input Before Code

### Pack-level pricing (need your call)

Current billing gates on mode — all modes available at Builder+. For Phase 10-11, all packs available to all paid tiers; free tier gets `web_classics` only. But: do you want `mcp_server` as a premium add-on later? If yes, we'll need either new `product_key` values per pack or a feature-flag column on subscriptions. Can defer to Phase 13 but worth deciding directionally now.

### Scoring formula reconciliation (blocking)

Two divergent scoring functions exist:
- `worker/src/engine/scoring.ts` — medium=-6, info=-0.5, has -5 critical bonus
- `platform/lib/report.ts` — medium=-5, info=0, no critical bonus

Which is canonical? Need to reconcile before packs add more findings that amplify the divergence.

### Supabase probe false positives

The `supabase_anon_key_exposed` probe will fire on nearly every Lovable/Bolt app because those platforms scaffold Supabase with client-side anon keys by design. The key alone isn't a vuln — it depends on RLS. Decision baked into probe design: two-stage check (detect key → attempt unauthorized table ops). Critical only if both stages pass. Info-level if key found but RLS blocks. Flagging because this is the highest-volume probe and incorrect severity would erode trust.

### MCP server transport limitation

Current engine architecture is HTTP-only. MCP servers on stdio can't be tested without a different transport layer. Decision: Phase 13 targets HTTP/SSE MCP servers only (the production deployment pattern). Stdio testing is scoped out to Phase 20+ as CLI-only.

### Badge domain

Badge lives at `/badge/<uuid>.svg` on `oraclebot.net`. No subdomain needed now. If badge traffic exceeds ~100k/day, can move to `badge.oraclebot.net` backed by a Cloudflare Worker reading same DB. Not a blocking decision.

### No centralized phase map existed

The phase numbers above are reconstructed from scattered code comments. This plan becomes the canonical phase map. `ROADMAP.md` should be created as Phase 10's first commit.
