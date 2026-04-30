# Concierge Offering — Pre-Launch Readiness Engagement

A sellable one-pager for the concierge product. Use this as the basis for proposals, prospect calls, and the "What does an engagement look like?" answer on outbound.

---

## What you get

A **Pre-Launch Readiness Engagement** is a fixed-scope service in which OracleBot operates a population of synthetic users against your staging environment and delivers a written readiness report.

You launch knowing what breaks under realistic, multi-user load — not because you guessed, but because we already broke it for you on staging.

---

## Three engagement tiers

### Pilot — $10,000

**For:** Teams who want to see the format before committing budget. Common for seed-stage / early Series A.

**Scope:**
- 1 run, up to 4 hours, against one staging environment
- Up to 1,500 personas, single archetype mix
- One vertical template (trader archetypes, marketplace buyers/sellers, social creators, or SaaS workspaces)
- API-level personas only (no browser-driven flows)

**Deliverables:**
- Live observability during the run (Slack channel, real-time error feed)
- Written readiness report within 5 business days
- Up to 3 flagged-flow walkthroughs on a follow-up call

**Timeline:** 2–3 weeks from kickoff.

---

### Standard — $25,000 *(default for fintech / trading)*

**For:** Teams approaching public launch within 60–90 days. The default fintech engagement.

**Scope:**
- 2 runs against one or two staging environments (e.g., one "normal day," one "market open")
- Up to 5,000 personas, configurable archetype mix
- Vertical template + custom persona overrides
- API-level personas + browser-driven flows for signup / KYC / first deposit / first trade
- One market-condition scenario per run (flat, volatile, news shock, etc.) for trading engagements

**Deliverables:**
- Live observability during runs
- Written readiness report within 7 business days, including:
  - Every 4xx/5xx flagged with the persona, flow, and reproduction steps
  - p50/p95/p99 latency by endpoint and by persona archetype
  - Throughput ceiling discovered (the rate at which the system started degrading)
  - List of recommended fixes prioritized by launch-blocking severity
- 30-minute walkthrough call
- Re-run discount (-30%) if you ship fixes and want to verify within 30 days

**Timeline:** 4–6 weeks from kickoff.

---

### Launch — $50,000

**For:** Teams launching to a public list, expecting press coverage, or with regulatory exposure (fintech with real money on day one).

**Scope:**
- Up to 4 runs across multiple staging environments and scenarios
- Up to 10,000 personas, fully custom archetype mix
- All persona types including browser-driven trading and signal-subscription flows
- Multiple market conditions (open, midday, close, news shock, halt)
- "Launch rehearsal" run that simulates your expected day-one signup curve compressed into 60 minutes

**Deliverables:**
- Everything in Standard, plus:
- A **Launch Rehearsal Report** that maps "if X traders show up in the first hour, here's what will degrade and at what point"
- One on-call engineer reachable on launch day for 8 hours
- Dedicated Slack channel for the duration of the engagement (typically 6–8 weeks)
- Priority re-run scheduling

**Timeline:** 6–8 weeks from kickoff.

---

## What we need from you

| Phase | What we need | When |
|---|---|---|
| Kickoff | Staging URL, ownership verification (DNS TXT or OAuth), API documentation or Postman collection, named technical point of contact | Week 1 |
| Persona design | 30 minutes on a call to walk through your real user archetypes so we can tune the template | Week 1–2 |
| Pre-run | Confirmation that external dependencies (KYC, payments, market data feeds) are either mocked or sandboxed; staging-hardening checklist signed | 3 days before run |
| Run window | Eng on-call for the run (Slack reachable); ability to ship hotfixes mid-run if we surface a blocker | Run day |
| Post-run | 30 minutes for the walkthrough call after the report is delivered | Within 10 days post-run |

---

## What we don't do

- We don't run against production. Ever.
- We don't run against domains you don't own. Verification is gating, not optional.
- We don't replace your QA team. We complement it — we surface population-scale behavior; your QA covers single-flow correctness.
- We don't promise to defeat sophisticated bot detection. Our personas exercise your product the way a customer would; they don't pretend to *not* be programmatic to a CAPTCHA designed to catch them. We coordinate with you to disable WAF/bot-detection on staging during runs.
- We don't share what we observe across customers. Your run data is yours.

---

## What's *not* included (and what costs extra)

- **Custom persona development beyond the template** (e.g., a brand-new archetype not in the trader/marketplace/social/SaaS library): scoped separately, typically +$5–10k.
- **Integration with non-standard observability tools** (something other than Slack, Linear, Datadog, PagerDuty): scoped separately.
- **On-site or extended on-call coverage** (beyond the Launch tier's 8 hours): hourly rate, agreed in advance.
- **Re-engagement after the report's 30-day re-run window**: priced as a new engagement (often Pilot rate).

---

## Frequently asked (prospect FAQ)

**How is this different from k6 or Locust?**
k6 hammers an endpoint with a configured request shape. We populate your product with personas that *use* it — sign up, fund, place orders, message — and the bugs we surface are the ones that only show up when behavior interacts at population scale.

**How is this different from QA Wolf, Mabl, or testRigor?**
Those tools verify that one user can complete one journey. We verify that a population of users can all use your product simultaneously without it falling over. Different question, different surface.

**Do you need to see our code?**
No. Personas interact with your product through its public surfaces (API, websocket, web flows). We need API documentation and credentials to a verified staging environment. We do not need source access.

**What if our product isn't trading, marketplace, social, or SaaS?**
Talk to us. The vertical templates are starting points, not constraints. If your product is something else (logistics, telematics, edtech, etc.), we'll scope a custom persona library as part of the engagement. Likely a Standard or Launch tier with a +$5–10k persona-design line item.

**Can we pay in installments?**
Standard and Launch can be split 50/50 (kickoff / report delivery). Pilot is paid in full at kickoff.

**What's the smallest possible engagement?**
$10k Pilot. We don't take engagements below that — the operator time on our end doesn't pencil out.

**How do we get started?**
Reply to whoever sent you this doc, or email `hello@oraclebot.net` with: your staging URL, what you're launching, and roughly when. We'll come back within 3 business days with whether we're a fit and which tier we'd recommend.

---

## What success looks like

You finish your engagement with a written report that names specific bugs in specific flows, prioritized by launch-blocking severity. You ship fixes. You launch and the failure modes the report flagged don't show up in production.

If, after a Standard or Launch engagement, your day-one production failure has a root cause that was directly observable in the run we conducted and we didn't flag it, we'll do a free re-run plus a credit equal to 25% of the engagement fee. We don't guarantee zero launch-day issues — that's outside any vendor's control — but we do guarantee that what we observe, we report.
