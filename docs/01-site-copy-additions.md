# Site Copy Additions

Two pieces of copy queued from the strategy plan. Delivered as content + structural notes; HTML conversion is a separate pass.

---

## A. "What we won't do" panel

**Goal:** Codify the staging-only / owner-verified / no-engagement-farming stance as a public commitment. This is brand armor against being misread as a bot farm.

**Where it slots:** Insert as a new section between `#faq` and `#waitlist` in [index.html](../index.html). New section ID: `commitments`. Add a nav link `<a href="#commitments">Commitments</a>` between `FAQ` and the CTA.

**Section eyebrow:** `Commitments`
**Section heading:** `What OracleBot will never do.`
**Section lede:** Some constraints are how the product works. These are how the product *stays* the product.

**Four commitment cards (mirror the structure of the `problem__list` cards):**

### 1. Never run against production.
OracleBot refuses targets that look like live production environments. Every run requires a verified staging or pre-launch target — DNS TXT or OAuth proof — and we monitor for production tells (live TLS chain on apex, real user traffic, public DNS) and abort the run if we see them.

### 2. Never run against a domain you don't own.
Verification is gating, not a checkbox. No verified ownership, no run. We will not "make an exception" because a deal is on the line — the constraint is the product.

### 3. Never inflate metrics for any platform we don't operate.
OracleBot is a pre-launch readiness tool. It is not a service for boosting signups, followers, transactions, or any other number on a platform someone else runs. Every run is logged with the verified target and operator identity; abuse is investigable and we cooperate with takedown requests against operators who circumvent our verification.

### 4. Never sell or share what we observe.
What your synthetic users do in your staging environment stays in your account. We retain run logs (request counts, error rates, flagged flows) for the duration of the run and a configurable window after — and that's it. No training corpora, no benchmarks across customers, no leaks.

**Footer line on the section:** *These commitments are written into our terms and enforced in the runner. If we ever loosen them, you'll see it in a changelog before it ships.*

---

## B. Trading / fintech vertical landing variant

**Goal:** A vertical-specific landing page that converts trading/fintech buyers harder than the generic homepage. Live at `oraclebot.net/trading` (or `/fintech`).

**Where it slots:** New file `trading.html` (or a `trading/` subdirectory). Reuses `css/base.css` and `css/pages.css`. Most sections mirror the homepage structure but with trading-specific copy and proof.

### Hero

- **Eyebrow:** `Pre-launch readiness · For trading & signals platforms`
- **Title:** Test your matching engine *with traders*, not with curl loops.
- **Subhead:** OracleBot populates your staging exchange with thousands of trader personas — scalpers, swing traders, market makers, panic sellers — that fund accounts, place limit and market orders, react to price moves, and message channels. Find the order-book skew, the websocket fan-out bottleneck, and the partial-fill bug *before* your first real basis point is on the line.
- **Primary CTA:** Book a pre-launch run →
- **Secondary CTA:** See trader archetypes →

### Hero terminal (replace generic terminal)

```
$ oraclebot run --target staging.exchange.dev \
    --personas trader-archetypes \
    --book BTC-USD --rate 400rpm --duration 6h

[09:30:00] ● market open simulated · 1,840 personas active
[09:30:04] orders placed 612 · cancels 89 · fills 174
[09:30:11] ● book depth healthy · spread 2.1bps · p95 match 41ms
[09:31:02] persona mm_07 hit /api/orders 500 (under 200rps burst)
            → flagged · order book divergence 0.3bps for 14s
[09:31:48] ramp 1,840 → 4,200 over 12m
[09:32:14] websocket fan-out p99 218ms · within SLO
```

### Proof row

`Built for teams shipping`: spot exchanges · derivatives venues · prop trading dashboards · signals services · brokerages

### "What goes wrong on launch day" (replaces generic problem section)

**Eyebrow:** `What breaks at the open`
**Heading:** A trading platform that hasn't been *traded against* hasn't been tested.

Four cards:

1. **Order book skew under real population.** Your matching engine works fine when one tester places one order. It doesn't work fine when 400 scalpers and 12 market makers are all working the bid at the same time. The bugs hide in the cross.
2. **Websocket fan-out hits a wall.** Quote ticks go out fine to ten clients. At a thousand subscribed sessions, p99 latency goes from 40ms to 4 seconds and your traders see stale prices. By then it's too late to fix.
3. **Onboarding chokes at the open.** KYC + funding + first deposit happen *in the same five minutes* on launch day. Your KYC vendor hits a rate limit nobody noticed in QA, and 30% of signups stall mid-flow.
4. **Signals fan-out collapses recommendations.** Your signals product looks great with three test signals and four test users. With 8,000 subscribers, the publisher's notification batch backs up and signals arrive 90 seconds late — the exact window in which the price moved.

### Trader archetypes (new section unique to this page)

**Eyebrow:** `Personas`
**Heading:** Eight trader archetypes, mixed to match your population.

Card grid (8 personas):

| Archetype | Behavior profile |
|---|---|
| **Scalper** | High-frequency limit orders, tight stops, cancels often, sub-second decision latency. Stresses your matching engine and order cancel pipeline. |
| **Swing trader** | Multi-day positions, larger size, fewer orders, watches signals/news. Stresses signals fan-out and notification latency. |
| **HODLer** | Buys, walks away. Long sessions with low activity. Stresses session/auth expiry and idle reconnect. |
| **Market maker** | Two-sided quotes, frequent re-pricing, large open-order count. Stresses your open-order ceiling and order-book replication. |
| **Panic seller** | Triggered by drawdown, dumps positions in a burst. Stresses your circuit breakers and partial-fill logic. |
| **Bot copier** | Mirrors a "lead" trader's actions with delay. Stresses your copy-trading pipeline and rate limits. |
| **Whale** | Few orders, very large size, often iceberged. Stresses your iceberg/hidden-order logic and risk checks. |
| **Newbie** | Misclicks, abandons KYC, retries deposits. Stresses your error states and recovery flows. |

**CTA under grid:** Compose your own mix → (links to a "Custom mix" doc or contact form)

### "What we exercise" (replaces generic uses section)

Four pillars with checklists underneath:

**Order pipeline**
- Limit / market / stop / iceberg orders
- Order cancel & modify under burst
- Partial fills, IOC, FOK
- Risk checks at submission
- Post-trade allocation

**Market data**
- Websocket subscribe/unsubscribe at population scale
- Quote tick fan-out p50/p95/p99
- Stale-price detection
- Reconnect storm after a synthetic disconnect

**Onboarding & funding**
- KYC submission rate limits
- Deposit pending → cleared transitions
- First-trade unlock flow
- Tier upgrades

**Signals & social**
- Signal publish → fan-out latency
- Subscriber notification delivery
- Channel message moderation
- Copy-trade enrollment

### Compare row (trading-specific)

Same compare table structure, but rows tuned to fintech buyer concerns:

| | k6 / Locust | QA Wolf / Mabl | OracleBot |
|---|---|---|---|
| Generates a trader population, not endpoint hits | no | no | **yes** |
| Trader archetypes (scalper, MM, panic seller, etc.) | no | no | **8 archetypes shipped** |
| Exercises matching engine end-to-end | scripted endpoints | one journey | **at population scale** |
| Surfaces order-book skew under real load | no | no | **first-class metric** |
| Owner-verified targets only | user discretion | via account | **DNS or OAuth, gating** |
| Production-target refusal | no | no | **enforced by the runner** |

### Trading-specific FAQ (additions to the generic FAQ)

1. **Can OracleBot exercise my matching engine without seeing my orderbook code?**
   Yes. Personas only interact with the surfaces your real traders will — your public order API, your websocket feed, your signup flow. We don't need to see your matching engine internals; we just need to be able to place, cancel, and fill orders the way a customer would.

2. **What about KYC vendors and external rate limits?**
   We coordinate with you on which external dependencies to mock in staging vs. exercise live. The default is to mock external KYC/payments providers in staging unless you have a sandbox tier; the runner exercises everything *up to* the integration boundary.

3. **Will personas place real orders on real markets if our staging connects to a real venue?**
   Only if you tell us it's safe. We default to assuming any external venue connection in staging is *not* safe and refuse to exercise it. You explicitly opt in to "this venue is a sandbox" before any persona places orders that touch it.

4. **How do you simulate market conditions — flat tape vs. volatile open?**
   You can configure a market scenario at run start: flat, trending, volatile open, news shock, circuit-breaker trigger. Personas react to the scenario via their archetype's behavior profile (e.g., panic sellers fire on drawdown, scalpers lean in on chop).

5. **Can you exercise our risk checks?**
   Yes — we'll deliberately try to violate them. Newbie personas will attempt over-leverage, whales will attempt size limits, panic sellers will attempt to liquidate during halts. The report flags every risk-check bypass that should have caught the persona but didn't.

### Closing CTA

**Heading:** Run a pre-launch readiness engagement.
**Body:** A typical fintech engagement is a 4–6 hour sustained run against your staging exchange with 2,000–8,000 personas, paired with a written readiness report naming every flow we flagged. Pricing starts at $25k for a single run; multi-run packages and ongoing access are available.

**Primary CTA:** Talk to us → (links to scheduling / waitlist)
**Secondary CTA:** See the readiness report format → (links to a sample report PDF, future deliverable)

---

## Build notes

- The trading variant should be cross-linked from the homepage's `Trading & signals platforms` use case card (anchor link → `/trading`).
- Reuse `css/base.css` and `css/pages.css`; only add new classes if a new section type doesn't have a homepage analog (the trader-archetype grid is one — others can reuse existing classes).
- The "What we won't do" / Commitments section should be added to *both* the homepage and the trading variant.
- Once the trading variant is live, plan to repeat the pattern for marketplaces, social, and SaaS — but only after the trading variant has run a quarter and produced data on whether vertical landings convert better than the generic homepage.
