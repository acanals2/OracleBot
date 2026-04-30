# Runner Architecture Sketch

A V0 → V1 technical design for the OracleBot runner. The goal of this doc is to give you enough scope to make a build/buy decision and to start hiring or contracting against, not to be a final spec. Implementation choices are recommendations, not constraints.

---

## Design principles

1. **Concierge-first, productized-later.** V0 is a pile of internal tools that *operators* (you) use to deliver an engagement. V1 is what some of those tools harden into for self-serve customers. Don't build for self-serve until you know what the engagement actually looks like.
2. **Ownership verification is a hard gate, not a UI flow.** It runs at the *runner* layer. If you can't bypass it from the customer-facing UI, that's nice. If you can't bypass it from the runner itself, that's load-bearing.
3. **API personas before browser personas.** API personas are 10–100x cheaper to operate and cover 70% of what fintech engagements need. Browser personas are a premium tier, not the default.
4. **Every run is a tracked artifact.** Persona configs, target verification, run logs, deltas in the customer's system — all logged. Audit trail is part of the product.
5. **Externalize what's commodity, build what's the wedge.** The wedge is the persona engine + reporting. The runner infrastructure (queues, browser farms, observability plumbing) is undifferentiated — buy or use OSS.

---

## V0 — Concierge tooling (build first)

What you actually need to deliver the first 3 paid engagements. Not productized. Not multi-tenant. Just enough infrastructure that you can run an engagement and produce a report.

### Components

```
                  ┌─────────────────────────────────────────────────────────┐
                  │  Operator console (you)                                 │
                  │  - Internal CLI / tiny web UI                           │
                  │  - Trigger runs, watch logs, generate reports           │
                  └────────────┬────────────────────────────────────────────┘
                               │
                               ▼
       ┌─────────────────────────────────────────────────────┐
       │  Verification service                               │
       │  - DNS TXT lookup                                   │
       │  - OAuth handshake (per-customer)                   │
       │  - Production-detection heuristics (see below)      │
       │  - Refuses run if verification fails                │
       └─────────────────────────┬───────────────────────────┘
                                 │ verified target
                                 ▼
       ┌─────────────────────────────────────────────────────┐
       │  Persona engine                                     │
       │  - Vertical templates (trader-archetypes V0)        │
       │  - Behavior profiles (timing, decision branching)   │
       │  - Persona state (auth tokens, balances, positions) │
       └─────────────────────────┬───────────────────────────┘
                                 │ N personas
                                 ▼
       ┌─────────────────────────────────────────────────────┐
       │  Runner workers                                     │
       │  - API persona executor (HTTP/WS clients)           │
       │  - Browser persona executor (Playwright + Browserbase)│
       │  - Rate / ramp / duration controller                │
       └─────────────────────────┬───────────────────────────┘
                                 │ HTTP/WS to customer staging
                                 ▼
       ┌─────────────────────────────────────────────────────┐
       │  Customer staging environment (verified target)     │
       └─────────────────────────────────────────────────────┘
                                 │ telemetry
                                 ▼
       ┌─────────────────────────────────────────────────────┐
       │  Observability + reporting                          │
       │  - Per-request logs (status, latency, persona)      │
       │  - Per-flow aggregation                             │
       │  - Slack/Linear webhook for flagged events          │
       │  - Report generator (Markdown → PDF)                │
       └─────────────────────────────────────────────────────┘
```

### Component-by-component

#### 1. Verification service

**What it does:** Given a customer-claimed staging target, returns `verified: true` only if the customer has proven they own it AND it's not production.

**How to build (V0):**
- Single Go or Python service with two endpoints: `POST /verify/dns`, `POST /verify/oauth`.
- DNS check: query for a `TXT` record at `_oraclebot.<target>` matching a per-customer challenge string.
- OAuth check: standard OAuth 2.0 flow against the customer's IdP (start with Google Workspace, GitHub, Okta — covers 80% of fintech).
- Production-detection heuristics (run on every verified target before a run starts):
  - DNS resolution returns a public, non-private IP that's also resolved by a major resolver — flag.
  - TLS certificate's SAN list includes a clearly-public domain (`www.<target>`, `api.<target>`) — flag.
  - HTTP `GET /` or a known health endpoint shows live customer-facing branding ("Sign in," real product copy) — flag.
  - Whois shows registrar metadata indicating a long-running, monetized property — flag.
- Any heuristic that fires → run is held, operator is paged, customer is asked to confirm "yes, this is staging" with a manual override that's logged. After the first 5 runs, tighten the heuristics based on false-positive patterns.

**What it doesn't do (yet):** Self-serve customer onboarding. V0 has the operator (you) running verification on the customer's behalf.

#### 2. Persona engine

**What it does:** Defines what a "scalper" or "panic seller" *is* — their action distribution, timing, decision logic — and instantiates N of them with state.

**How to build (V0):**
- Single repo with one folder per vertical template (`templates/trader/`, `templates/marketplace/`, etc.). V0 only needs `templates/trader/`.
- Each archetype is a Python class (or Go struct) with:
  - `decide(state) -> Action` — what does this persona do next given its current state?
  - `react(event) -> Action | None` — does an external event (price tick, order fill, message) trigger an immediate action?
  - `timing_distribution()` — sleep distribution between actions (log-normal is a fine default).
  - `parameters` — size mean/variance, aggressiveness, etc.
- Persona state is a struct: `{auth_token, balance, open_orders, positions, last_action_at}`. Live in Redis during a run.
- Action vocabulary (V0 — trader-only): `signup`, `kyc_submit`, `deposit`, `place_limit`, `place_market`, `cancel_order`, `subscribe_channel`, `send_message`.
- Mix configuration: `{scalper: 0.4, swing: 0.3, market_maker: 0.1, hodler: 0.2}` → engine instantiates that distribution at the requested population size.

**Key call:** Don't try to make personas "AI-driven" in V0. Rule-based archetypes with stochastic timing are sufficient for the wedge and far more reliable than LLM-driven personas. LLM-driven personas are a V2 differentiation bet, not a V0 requirement.

#### 3. Runner workers

**What it does:** Takes the persona instances and executes their actions against the verified target at the configured rate.

**How to build (V0):**
- Two worker pools:
  - **API workers**: lightweight, async (Python `httpx` + `asyncio`, or Go goroutines). Each worker can drive 50–200 personas concurrently. Hosted on cheap compute (Fly.io, Railway, or a single beefy box).
  - **Browser workers**: heavyweight, one Chromium instance per persona. Use **Browserbase** or **Steel.dev** to outsource the browser farm — paying per-session is much cheaper than running your own at V0 scale. Playwright is the driver.
- Job queue: Redis Streams or a single Postgres `runs` + `actions` table with `SELECT FOR UPDATE SKIP LOCKED`. Don't reach for Kafka.
- Rate / ramp control: a single coordinator process that emits "tick" pulses; workers only execute actions when allowed by the current tick budget. Allows ramp curves like `0 → 1,800 over 6m`.
- Duration: hard cutoff timer per run.

**Key call:** Browser personas are 50–100x more expensive to operate than API personas (Browserbase is roughly $0.05–0.10/session-minute). Default to API personas; only spin up browser personas for flows where the browser actually matters (signup, KYC, checkout).

#### 4. Observability + reporting

**What it does:** Captures every request, every error, every latency reading, and produces the readiness report.

**How to build (V0):**
- All persona actions emit a structured log: `{run_id, persona_id, archetype, action, target_url, status, latency_ms, error?, timestamp}`.
- Pipe logs to **ClickHouse** (cheap to run, fast aggregations) or for V0, **a Postgres TimescaleDB instance**. Don't bother with Datadog / Honeycomb until you're delivering >5 engagements/month.
- Slack webhook fires on:
  - 5xx from any persona action.
  - p99 latency on any endpoint exceeds a configurable threshold.
  - Any action that returns "success" but produces an inconsistent state (e.g., place_order succeeds but position doesn't update).
- Report generator: a Python script that queries the run logs and outputs a Markdown report → wkhtmltopdf → PDF. Don't build a dashboard. The report is the artifact, and a static PDF is more useful to the customer than a live dashboard during the first 5 engagements.

**Report structure (template the script generates):**
1. Run summary (target, duration, persona mix, total actions)
2. Headline findings (3–7 bullets)
3. Latency by endpoint (p50/p95/p99 table)
4. Throughput ceiling (the rate at which degradation started)
5. Flagged flows (per-flow breakdown with reproduction steps)
6. Recommended fixes prioritized by launch-blocking severity
7. Appendix: full action log link

#### 5. Operator console

**What it does:** Lets *you* (the operator) trigger and monitor runs.

**How to build (V0):**
- A `oraclebot` CLI: `oraclebot verify <target>`, `oraclebot run --config run.yaml`, `oraclebot report <run_id>`.
- That's it for V0. Don't build a web UI for operators until the CLI's friction is real. Maybe add a tiny FastAPI dashboard later if multiple operators need shared visibility.

### V0 build size

Realistically: 1 senior engineer, 6–10 weeks, to a state where you can deliver a paid engagement. Two engineers cuts that roughly in half if they parallelize on persona engine vs. infrastructure.

---

## V1 — Self-serve productization (build after 3+ engagements)

What you build *only after* you've delivered enough concierge engagements to know:
- Which persona archetypes customers actually configure (drop the unused ones)
- Which run configurations produce the "aha" findings (default to those)
- Which reports customers re-read (those become the dashboard primitives)
- What the unit economics look like at concierge scale (informs SaaS pricing)

### V1 additions

| Surface | What changes |
|---|---|
| Verification | Self-serve flow: customer drops a TXT record, the service verifies, customer is cleared to schedule runs. |
| Persona library | UI for selecting + customizing archetype mixes. Drag-and-drop or YAML editor. |
| Runner control plane | Customer-facing scheduling: "run this config every Tuesday at 9am UTC." |
| Reporting | Live dashboard during runs (the artifact stays the PDF, but customers want real-time visibility too). |
| Billing | Stripe metered billing on persona-hours. |
| Multi-tenancy | Per-customer isolation in the workers and the persona-state store. |
| Webhooks / integrations | Slack, Linear, Datadog, PagerDuty as first-class integrations. |

### What stays the same

- Verification gate — never loosens.
- Production-target refusal — never loosens.
- Audit trail — never loosens.
- Concierge tier remains for sale at premium pricing for customers who want a delivered engagement, not a SaaS dashboard.

---

## Build vs. buy decisions

| Component | Recommendation | Why |
|---|---|---|
| Browser farm | **Buy (Browserbase / Steel.dev)** | Running your own at V0 volume is undifferentiated work. Switch to self-hosted at >5,000 browser-hours/month. |
| Job queue | **Build trivially (Postgres or Redis Streams)** | Off-the-shelf queues are bigger than you need. |
| Observability backend | **Buy if budget allows (Honeycomb/Datadog), build with ClickHouse if not** | Pick once. ClickHouse is cheap and fast. |
| Persona engine | **Build** | This is the wedge. Don't outsource. |
| Verification service | **Build** | Also load-bearing for the brand. Don't outsource. |
| Report generator | **Build trivially (Markdown + wkhtmltopdf)** | Don't reach for headless reporting tools. |
| Auth (operator + customer) | **Buy (Clerk / WorkOS)** | Don't build SSO from scratch in V0. |
| Billing (V1) | **Buy (Stripe)** | Obviously. |

---

## Security model summary

- **Customer credentials to staging:** stored encrypted at rest in a secrets manager (1Password Connect, Vault, AWS Secrets Manager). Rotated per-engagement. Never in source.
- **Persona state:** per-run, ephemeral. Wiped on run completion + retention window.
- **Operator access to customer environments:** logged. Every action has an attributable operator.
- **Run logs:** retained for the run + a configurable window (default 30 days). Customer-deletable.
- **Cross-tenant isolation:** V0 has *one* tenant per run (the customer being engaged). V1 needs proper isolation in the persona-state store and workers — namespacing in Redis, separate DB schemas, or fully separate instances per high-value customer.
- **Refusal logging:** every time the verification service refuses a run, log it with target + claimed operator. This is your evidence trail if someone later claims you allowed an unauthorized run.

---

## What this architecture does *not* try to do

- Defeat sophisticated bot detection. Personas don't pretend to be non-programmatic to a CAPTCHA designed to catch them.
- Drive arbitrary websites with no API documentation. V0 customers must provide API docs (Postman, OpenAPI, or equivalent).
- Run against production. The whole architecture refuses this by design.
- Replace your customer's QA. Different surface, different question.
- LLM-driven personas with emergent behavior. V0 and V1 are rule-based. LLM-driven personas are a V2 R&D bet — keep it on the radar, don't commit yet.

---

## Open questions to resolve before V0 build starts

1. **Hosting target?** A single beefy VPS gets you to V0. AWS/GCP from day one is overkill but sometimes required by the customer's security review. Pick based on the first paid customer's constraints.
2. **Language?** Python is faster to build the persona engine; Go is faster to operate at scale. V0 in Python is the correct call unless your team is Go-native.
3. **First vertical template depth?** All 8 trader archetypes from day one, or 4 (scalper, swing, MM, panic) and grow? Start with 4. The other 4 are configurable mixes of the first 4 with parameter shifts.
4. **Browser persona inclusion in Pilot tier?** Probably not — keeps Pilot's COGS predictable. Document this in the offering tiers.
5. **Do you build it yourself, hire one engineer, or contract?** A senior contractor for 8 weeks is the lowest-risk V0 build. Hire full-time only after the second engagement closes.
