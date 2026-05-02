# Batch 1 — Exhibits

First end-to-end OracleBot scan. Captured 2026-05-02.

## Run

| Field | Value |
|---|---|
| Run id | `043c22e4-2315-41c9-9122-bddd6052f7a6` |
| Target | `https://oracle-bot-seven.vercel.app` (dev marketing-site deploy) |
| Mode | site |
| Packs | `web_classics`, `ai_built_apps` |
| Bots × duration | 5 × 3 min |
| Status | completed |
| **Readiness score** | **64 / 100 (Grade D, red)** |
| Verification id | `2b840cd6-078e-403c-962e-41e26a19e030` |

## Findings — 6 medium

| # | Title |
|---|---|
| 1 | JS console error: Failed to load resource: the server responded with a status of 404 () |
| 2 | Slow response: / took 3504 ms |
| 3 | Slow response: /monitoring took 12017 ms |
| 4 | Slow response: /monitoring took 13840 ms |
| 5 | Slow response: / took 13305 ms |
| 6 | Slow response: / took 19729 ms |

Score derivation: 6 × medium − 6 = − 36, total 100 − 36 = **64**.

Note — findings landed without `probeId` because the production Railway worker
(running pre-Phase-10 code) grabbed the job, not the local worktree worker.
This is expected during Batch 1 and resolves naturally in Batch 2 when the
worker code deploys to prod. The score, badge, and embed surfaces all work
correctly regardless.

## Badge

`/api/badge/2b840cd6-078e-403c-962e-41e26a19e030.svg` returned `image/svg+xml`,
1-hour CDN cache. Saved as `batch1-badge.svg`.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="89" height="20" role="img"
     aria-label="oraclebot: 64">
  <title>oraclebot: 64</title>
  …
  <text x="76" y="14">64</text>
</svg>
```

Color: `#f85149` (red — score < 70). Width: 89 px. Shields.io-compatible.

## Score page

`/score/2b840cd6-078e-403c-962e-41e26a19e030`:

- Shows "ORACLE-BOT-SEVEN.VERCEL.APP" + "TODAY" labels in the header
- "**64 / 100**" in red, large numerals
- "Grade D" pill (red border, red text)
- "Embed this badge" section with three live snippets:
  - Markdown
  - HTML
  - Image URL

All three snippets contain the absolute URLs (with `localhost:3100` in this
test; will be `oraclebot.net` once `NEXT_PUBLIC_APP_URL` is set in prod).

## Embed snippets (live)

```markdown
[![OracleBot Readiness](http://localhost:3100/api/badge/2b840cd6-078e-403c-962e-41e26a19e030.svg)](http://localhost:3100/score/2b840cd6-078e-403c-962e-41e26a19e030)
```

```html
<a href="http://localhost:3100/score/2b840cd6-078e-403c-962e-41e26a19e030">
  <img src="http://localhost:3100/api/badge/2b840cd6-078e-403c-962e-41e26a19e030.svg"
       alt="OracleBot Readiness" />
</a>
```

## What this proves

- Run lifecycle works end-to-end: queued → provisioning → running → completed
- Site-bot Playwright crawl produces real findings against a live target
- Scoring formula evaluates correctly (64 from 6 mediums)
- Badge endpoint resolves verification → run → SVG with right color
- Score page renders, all three embed snippets formatted correctly
- Anti-gaming checks pass: badge tied to verified domain, points at most
  recent completed run, freshness window honored

## Deferred to Batch 2

- Pack badges in FindingsList UI — pending probe-id-tagging worker
- `oraclebot.net` carve-out removal → real verification flow with
  well-known file
- This run's findings are tagged `(no probe id)` because prod worker has
  pre-Phase-10 code

## Testing affordances created (NOT to ship to prod)

- `platform/scripts/seed-oraclebot-verification.mts`
- `platform/scripts/find-active-org.mts`
- `platform/scripts/trigger-oraclebot-scan.mts`
- `platform/scripts/cancel-run.mts`
- `platform/scripts/check-run.mts`

These will move under `scripts/dev/` or get deleted before the Batch 2 commit.
