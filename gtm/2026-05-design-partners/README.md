# 2026-05 design-partner sprint

This folder is the GTM playbook for the AI-built-apps SaaS launch — the
companion to the older concierge / trading-vertical playbook one level up
in `gtm/`.

## What's in here

| File | Purpose |
|---|---|
| [cold-dm.md](./cold-dm.md) | Outreach scripts for 4 prospect archetypes, multi-channel |
| [demo-script.md](./demo-script.md) | Minute-by-minute walkthrough for the 20-min discovery call |
| [follow-up-templates.md](./follow-up-templates.md) | Day-by-day cadence templates for cold + post-demo follow-ups |
| [design-partner-tracker.csv](./design-partner-tracker.csv) | Pipeline tracker — fill in 5 names and work the list |

## The plan, in one paragraph

Pick **5 specific people** shipping AI-codegen apps. Pre-flight: scan
their public app, capture findings + score. Send 5 cold DMs in the
order specified in `cold-dm.md`. Run the demo per `demo-script.md` for
anyone who replies. Follow `follow-up-templates.md` rigidly — most of
the conversion happens in the follow-up, not the first touch. Track
everything in the CSV. **Two design partners signed in 30 days is the
target.** Five is excellent. Zero means the positioning is wrong, not
that the product is wrong.

## Operator-side prerequisites (do these first)

Per the project status review on 2026-05-03 — none of this works
until these four things are true:

- [ ] `oraclebot.net` DNS points at the marketing-site Vercel project
   (currently a placeholder shows up sometimes — kills credibility on
   demo calls)
- [ ] Railway worker healthcheck is set to `/readyz` (not `/healthz`)
- [ ] `RAILWAY_TOKEN` GitHub secret is rotated so `deploy-worker.yml`
   stops failing
- [ ] You've run one real scan against a friend's Lovable / v0 / Bolt
   project so you have a live readiness badge in your pocket for the
   first call

The first three live in [docs/deploy.md](../../docs/deploy.md)
"Operations checklist." The fourth is a 5-minute task — just do it.

## What to send vs. what to keep private

**Public-facing artefacts (link from DMs and demos):**

- [oraclebot.net](https://oraclebot.net) — marketing site
- [/probes.html](https://oraclebot.net/probes.html) — 49-probe catalogue
- [/score/<verificationId>](https://oraclebot.net) — public score pages
- [/api/probes](https://oraclebot.net/api/probes) — JSON manifest for
  the technically curious

**Internal only (never link from cold outreach):**

- The dashboard `/app/*` (only after they sign a DP agreement)
- This folder
- Any internal Notion / Linear / project-management tool

## When to come back to building

Once you have **2 signed design partners**, your build priorities are
no longer mine to guess. They are:

1. Whatever the design partners ask for (bias toward repeated requests
   from both, not features either asks for once)
2. The Tier-1 items from [the project status review](../../docs/deploy.md)
   that became blockers because of (1)
3. Stripe activation (they will eventually want to pay, and friction
   here kills momentum)

Until then: the loop is **outreach → demo → follow-up → sign → ship
based on feedback → outreach next batch**. No building inside the loop.
The loop runs at distribution speed, not coding speed, and that's fine.
