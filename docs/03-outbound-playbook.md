# Outbound Playbook

Targeting criteria, sourcing methodology, and message templates for landing the first 3–5 paid concierge engagements.

**Honest upfront note:** A list of "20–30 specific pre-launch fintech companies right now" is not something I can produce reliably without live web research, and pre-launch companies are by definition the worst-indexed in any database. What this doc gives you instead is a **sourcing methodology** that produces that list in a few hours of research, plus messaging that converts when you reach them.

---

## Who you're looking for

**Sweet-spot prospect (in order of priority):**

1. **Trading platform, pre-public-launch, last 30–90 days before going live.** Any of: spot crypto exchange, derivatives venue, prop trading dashboard, signals/copy-trading service, brokerage. Seed to Series A typical.
2. **Trading platform, post-launch but planning a major scale event.** New asset class, geography expansion, or a marketing push expected to 5–10x signups.
3. **Adjacent fintech with population dynamics.** Lending platforms with auctions, robo-advisors with rebalancing storms, crypto wallets with social/swap features.

**Disqualifiers (do not waste outbound on these):**
- Already launched and stable, no scale event upcoming → no urgency
- Two-person teams pre-product → no budget
- Enterprise incumbents → procurement cycle longer than your runway
- Operators of services that look like engagement-farming targets (e.g., follower-growth, view-boost, signup-volume products) → wrong-side-of-the-line buyers, decline these

---

## Where to find them

Run these in parallel, expect ~2 hours to produce a list of 30 named companies with named contacts:

### Source 1 — Recent fundraising announcements

- **TechCrunch / The Information / Fintech Newsletter** archives, last 90 days, filter for: "trading platform," "exchange," "signals," "copy trading," "derivatives," "prop trading."
- **Crunchbase** filter: Industry = Trading Platform / FinTech, Funding Round = Seed or Series A, Last Funding Date in last 6 months.
- **Pitchbook** if you have access — same filters.

A company that just raised seed/A in trading is almost always pre-public-launch or scaling fast. They have budget and urgency.

### Source 2 — Accelerator batches

- **YC** — search the Launch page for fintech / trading companies in the most recent two batches. YC fintech founders are unusually responsive to founder-to-founder cold outbound.
- **a16z crypto Crypto Startup School** alumni.
- **Alliance DAO / Outlier Ventures** crypto cohorts (for crypto-native trading platforms).
- **Plaid Bridge / Stripe Atlas** newsletters occasionally surface fintech launches.

### Source 3 — Job postings as a launch signal

This is the highest-signal source most operators miss.

A company hiring **"Site Reliability Engineer," "Performance Engineer," "Trading Systems Engineer," "Launch Engineer"** in the last 60 days at a small fintech is almost certainly approaching a launch event. They're staffing for the failure modes you sell against.

- LinkedIn, Wellfound (formerly AngelList), Otta — search trading/fintech + the SRE-flavored titles above.
- The hiring manager on those listings is usually your buyer.

### Source 4 — Conferences & demo days

- **TokenForum, Consensus, Permissionless** — exhibitor lists are public and filter heavily for "we have a product to show."
- **Money 2020, FinovateFall** — same logic, more institutional.
- **YC Demo Day** lists.
- **Twitter/X** — "we're launching $PRODUCT next month" posts from fintech founders. Search: `(launching OR "going live" OR "public launch") (exchange OR trading OR signals) since:[date]`.

### Source 5 — Community signal

- **Crypto/DeFi Discords** for projects that have a testnet up and a roadmap public-launch date.
- **r/algotrading, r/CryptoCurrency** for new platform announcements.
- **Indie Hackers** fintech launches.

---

## Qualifying a prospect before you send

Before adding to the outbound list, confirm in 90 seconds:

| Signal | Where to check | What you want to see |
|---|---|---|
| Pre-launch or scaling | Their site / X / changelog | "Coming soon," waitlist form, public testnet, recent "we're scaling" post |
| Has a real product | Their staging or testnet | A real app, not just a marketing page |
| Has technical leadership | LinkedIn | A CTO or eng lead with system reliability background |
| Has budget | Crunchbase | Recent round, ideally Seed+ |
| Right-side-of-the-line | Their product description | They run their own platform — they're not a "growth/engagement" service |

If 4 of 5 are yes, send. If fewer than 3, skip — you're hunting whales, not casting nets.

---

## Outreach templates

### Template A — Cold email to founder/CTO at pre-launch trading platform

**Subject:** Pre-launch readiness for [Company]

> Hi [First name] —
>
> Saw [specific signal: their seed round / testnet launch / SRE job listing / X post about launching]. Quick note in case it's relevant.
>
> I run OracleBot. We populate pre-launch trading platforms with synthetic trader personas — scalpers, market makers, panic sellers, etc. — that fund accounts, place orders, and exercise the matching engine the way 5,000 real traders would. Most of what we surface in a single 4-hour run is order-book skew under burst, websocket fan-out hitting a ceiling, and KYC/funding flows choking when signups compress into the first hour of launch.
>
> Roughly: $25k for a single Standard engagement, written readiness report at the end, re-run discount if you ship fixes and want to verify before going live.
>
> If you're more than 30 days from public launch and want to find the bugs before your traders do, happy to walk through what an engagement against [Company] would look like. Fifteen minutes is plenty.
>
> [Your name]
> oraclebot.net

**What this email does right:**
- Specific signal in line 1 (proves it's not a blast)
- Vertical-specific archetypes named (proves you understand trading)
- Concrete failure modes named, not generic "performance issues"
- Price stated upfront (filters out tire-kickers, signals you're real)
- Clear ask: 15 min, conditional on timing fit

**What to avoid:**
- "I'd love to learn more about your business" → no
- "Quick question" subject lines → spam-flagged
- Multi-paragraph value props → they won't read past line 3
- Asking for their CEO's calendar without offering specific times → friction

---

### Template B — LinkedIn DM to hiring manager on an SRE/perf job listing

> Hi [First name] — saw the [Performance Engineer] listing at [Company]. The reason teams hire that role pre-launch is usually the same reason teams hire us: realistic load on staging is hard to fake.
>
> We run synthetic trader populations against pre-launch exchanges — 5k+ personas placing real orders, exercising your matching engine and websocket fan-out. Concierge engagement, written readiness report at the end, $25k.
>
> If [Company] is on a launch timeline and you're sourcing the kind of testing you'd otherwise build in-house, want to compare notes? 15 min.

**What this does right:**
- Frames their hire and your service as serving the same goal — flatters their decision
- Doesn't pretend the job listing is irrelevant; uses it as the signal
- Same price-up-front discipline as Template A

---

### Template C — Founder-to-founder, crypto-native

For crypto-native trading platforms (DEXs, perp protocols, derivatives venues), the vibe is more peer-to-peer and less corporate.

> [First name] — quick one. We populate pre-launch exchanges with synthetic trader populations. Scalpers, MMs, panic sellers, the works. They place real orders, exercise the matching engine, push websocket fan-out to its ceiling.
>
> Saw [their testnet / their X post / their seed]. If [Company] is heading toward mainnet and you want to see where it bends before real $ is on it, I'd run a pilot for you.
>
> $10k for a 4-hour Pilot run, $25k for the full Standard engagement with written report. Either way you get the readiness doc and we never run against anything except your verified staging.
>
> Worth a 15 min?

---

### Template D — Follow-up #1 (sent 5 days after Template A, no reply)

**Subject:** re: Pre-launch readiness for [Company]

> Hi [First name] — bumping this one in case it got buried.
>
> Three things that have come up in recent fintech engagements that might be relevant to [Company] specifically:
>
> 1. [One specific failure mode tied to their product, e.g.: "If you're running a CLOB with public matching, the place where it bends first under burst is almost always the cancel pipeline, not the place pipeline."]
> 2. [One specific operational concern, e.g.: "KYC vendors typically rate-limit at 50/min — the cliff teams hit on launch day is signup spikes that compress 200 KYCs into 60 seconds."]
> 3. [One specific scaling concern, e.g.: "Websocket subscriber count usually 10x's in the first 48 hours of public launch; staging tested at 1x falls over."]
>
> If any of those are live concerns, the engagement is built to surface exactly that kind of thing.
>
> If timing isn't right, no worries — happy to come back closer to launch.

**What this does right:**
- Adds specific value rather than re-pitching
- Three concrete failure modes give the prospect something to forward internally
- Soft close ("come back closer to launch") preserves the relationship

---

### Template E — Follow-up #2 (sent 10 days after Template D, no reply)

> [First name] — last note from me. If pre-launch readiness isn't on your roadmap, I'll stop bothering you.
>
> If it *is* and the timing's wrong now, just reply with a date and I'll come back then. Otherwise I'll assume it's a no for now and won't follow up further.

This is the "permission to stop" close. Surprisingly high reply rate because it doesn't ask for anything except a date.

---

## Outbound cadence

Per prospect:
- **Day 0:** Template A (email) or Template B (LinkedIn)
- **Day 5:** Template D
- **Day 15:** Template E
- **Day 30:** Move to nurture (newsletter / "saw this and thought of you" 1:1 once a quarter)

**Volume target for the first quarter:** 50 prospects sourced, 50 first-touches sent, 30 follow-ups, expected 8–12 replies, 4–6 calls, 1–2 closed engagements. The math is brutal but the deal sizes ($10–50k each) make it work.

---

## Tracking

A simple spreadsheet is fine for the first quarter. Columns:
- Company
- Source (which of the 5 above)
- Buyer name + role
- Buyer contact (email / LinkedIn)
- Qualifying signal (the specific reason you added them)
- Touch 1 sent date / Touch 2 / Touch 3
- Reply state (no reply / replied positive / replied no / replied "later")
- Notes

Don't buy a CRM until you have >100 prospects in the pipeline.

---

## Things that will tank conversion (avoid)

- Sending the same email to >5 prospects in the same hour. Looks like a blast even if every variable was customized.
- Mentioning "AI" anywhere in the cold email. The buyer pattern-matches it as low-quality automated outbound. Your differentiation is *population-scale behavior*, not "AI personas."
- Asking for a meeting before stating what you do. The buyer doesn't owe you 30 minutes to find out.
- Promising things the V1 product can't do (e.g., "human-like behavior on every page of any site"). Better to undersell and overdeliver in the engagement.

---

## Things that will accelerate conversion

- A reference logo. After the first paid engagement, get a one-line quote from the customer for the site. The second engagement closes 3x faster.
- A sample readiness report (anonymized). Most buyers can't visualize the deliverable. A 4-page PDF that shows them what they'll get demolishes the objection that "we'll just write a seed script."
- Founder-to-founder outbound for the first 10 prospects. Don't delegate the first wave. The signal that *the founder of OracleBot* personally noticed *the founder of [Company]'s* testnet announcement is worth more than any automation tool.
