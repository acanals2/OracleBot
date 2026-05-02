# GitHub Action — operator runbook

Phase 17. Distribution lever for OracleBot — every PR in every customer
repo runs a readiness scan and posts the score back as a comment.

## Where it lives

- **Action source**: `.github/actions/oraclebot-scan/` (composite action,
  pure Node 20 runtime, zero deps)
- **Dogfood workflow**: `.github/workflows/oraclebot-pr-scan.yml`
- **User-facing README**: `.github/actions/oraclebot-scan/README.md`

## How it authenticates

The action calls `POST /api/runs` and `GET /api/runs/<id>` with
`Authorization: Bearer obt_*`. Tokens are minted at
`oraclebot.net/app/settings/api-tokens` (UI not yet built — for now via
`POST /api/tokens` directly with a session cookie). See
`platform/lib/api-tokens.ts` for the full flow.

## How the dogfood workflow runs

`oraclebot-pr-scan.yml` runs on every PR + every push to main:

1. Checks out the repo (so the action can be referenced via `./.github/...`).
2. Calls the action with `target-url=https://oracle-bot-seven.vercel.app`
   (our dev marketing-site Vercel preview).
3. The action creates a run, polls until completion, sets outputs, posts a
   PR comment, fails the build if score < 60.

## Required GitHub secret

`ORACLEBOT_TOKEN` — set at **Settings → Secrets and variables → Actions →
New repository secret**.

To mint:

```sh
# With a Better Auth session cookie in your browser:
curl -X POST https://oraclebot.net/api/tokens \
  -H "content-type: application/json" \
  --cookie "$(cat ~/.oraclebot-cookie)" \
  -d '{"name":"github-action-oraclebot-self"}'
# Capture the `data.token` value — it's only shown once.
```

The token inherits the creating user's role on the active org.

## Marketplace listing (later)

When ready to publish:

1. Move `.github/actions/oraclebot-scan/` to its own public repo
   `oraclebot/oraclebot-scan@v1`
2. Tag a major version: `git tag v1 && git push origin v1`
3. Mark the latest release "publish to Marketplace" in the GitHub UI

## Runbook — what to do when the action fails

| Symptom | Cause | Fix |
| --- | --- | --- |
| `unauthenticated` | Token expired / revoked / typo | Mint a new token, update the repo secret |
| `Run-creation response missing runId` | API contract changed | Check `platform/app/api/runs/route.ts` returns `data.runId` |
| `Timed out after 20 minutes` | Worker queue backed up | Check Railway worker logs; raise `max-wait-min` for slow scans |
| `Below threshold` (and you didn't expect it) | Real readiness regression | Open the run URL, look at the new findings |
| PR comment never appears | `pull-requests: write` permission missing | Add `permissions: { pull-requests: write }` to the workflow |
