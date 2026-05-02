# OracleBot Scan — GitHub Action

Run an OracleBot readiness scan as part of your CI. Posts the score as a PR
comment with an embeddable badge, and fails the build below a configurable
threshold.

## Quick start

```yaml
# .github/workflows/oraclebot.yml
name: OracleBot readiness
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: oraclebot/oraclebot-scan@v1
        with:
          oraclebot-token: ${{ secrets.ORACLEBOT_TOKEN }}
          target-url: https://staging.your-app.com
          packs: web_classics,ai_built_apps
          min-score: 80
```

## What it does

1. Calls `POST /api/runs` with your input config.
2. Polls `GET /api/runs/<id>` every 8 s until completion (up to `max-wait-min`).
3. Sets GitHub Actions outputs (`score`, `status`, `run-id`, `run-url`,
   `badge-url`, `score-page-url`, `findings-count`).
4. Writes a Markdown summary to `$GITHUB_STEP_SUMMARY`.
5. On a `pull_request` event with `comment-on-pr: true` (default), posts or
   updates a PR comment with the score, top findings, and badge link.
6. Exits 1 if `score < min-score` and `fail-on-low: true` (default).

## Inputs

| Input               | Required | Default                          | Description |
| ---                 | ---      | ---                              | --- |
| `oraclebot-token`   | ✓        |                                  | API token from `oraclebot.net` → Settings → API tokens. |
| `target-url`        | ✓        |                                  | URL to scan. Must be a verified domain on the org tied to the token. |
| `packs`             |          | `web_classics,ai_built_apps`     | Comma-separated pack ids. See [available packs](https://oraclebot.net/ai-built-apps#probes). |
| `product-key`       |          | `free`                           | Tier the run is billed against. `free` / `scout` / `builder` / `studio` / `stack`. |
| `min-score`         |          | `70`                             | Minimum readiness score (0-100). Below this the action fails the build. |
| `fail-on-low`       |          | `true`                           | When `false`, the action posts the result but never fails the build. |
| `max-wait-min`      |          | `20`                             | How long to wait for the scan to complete. |
| `run-name`          |          | `<repo>@<sha>`                   | Human-friendly name for the run row. |
| `api-url`           |          | `https://oraclebot.net`          | Override only for self-hosted deployments. |
| `comment-on-pr`     |          | `true`                           | Post a PR comment on `pull_request` events. |
| `github-token`      |          | `${{ github.token }}`            | Token used for the PR comment. Needs `pull-requests: write`. |

## Outputs

| Output            | Example                                                  |
| ---               | ---                                                      |
| `score`           | `64`                                                     |
| `status`          | `completed`                                              |
| `run-id`          | `043c22e4-2315-41c9-9122-bddd6052f7a6`                   |
| `run-url`         | `https://oraclebot.net/app/tests/<id>/results`           |
| `badge-url`       | `https://oraclebot.net/api/badge/<verification-id>.svg`  |
| `score-page-url`  | `https://oraclebot.net/score/<verification-id>`          |
| `findings-count`  | `6`                                                      |

Use them in subsequent steps:

```yaml
- uses: oraclebot/oraclebot-scan@v1
  id: ob
  with: { oraclebot-token: ${{ secrets.ORACLEBOT_TOKEN }}, target-url: 'https://staging.app.com' }

- name: Echo score
  run: echo "OracleBot score = ${{ steps.ob.outputs.score }}"
```

## Examples

### Minimal — fail the build below 70

```yaml
- uses: oraclebot/oraclebot-scan@v1
  with:
    oraclebot-token: ${{ secrets.ORACLEBOT_TOKEN }}
    target-url: https://staging.acme.dev
```

### AI-built apps focus — Lovable / v0 / Bolt deploys

```yaml
- uses: oraclebot/oraclebot-scan@v1
  with:
    oraclebot-token: ${{ secrets.ORACLEBOT_TOKEN }}
    target-url: ${{ steps.deploy.outputs.preview-url }}
    packs: ai_built_apps
    min-score: 85
```

### LLM endpoint scan — agent + RAG endpoints

```yaml
- uses: oraclebot/oraclebot-scan@v1
  with:
    oraclebot-token: ${{ secrets.ORACLEBOT_TOKEN }}
    target-url: https://api.acme.dev/v1/chat
    packs: llm_endpoints
    min-score: 90
    fail-on-low: true
```

### Run, but never block — informational mode

```yaml
- uses: oraclebot/oraclebot-scan@v1
  with:
    oraclebot-token: ${{ secrets.ORACLEBOT_TOKEN }}
    target-url: https://staging.app.com
    fail-on-low: false
```

## Token setup

1. Sign in at https://oraclebot.net
2. Go to **Settings → API tokens**
3. Click **New token**, name it after the repo (e.g. `gh-action-acme/widget`)
4. Copy the `obt_*` value once — it's never shown again
5. Add it as a repo secret: **GitHub → Settings → Secrets and variables →
   Actions → New repository secret → `ORACLEBOT_TOKEN`**

## Verification

OracleBot only scans domains your org has verified. To verify a target:

1. **Settings → Domains → Add domain**
2. Choose the well-known-file or DNS TXT method
3. Publish the token and run the verification check

Targets on the carve-out list (`*.vercel.app`, `*.railway.app`,
`*.up.railway.app`) auto-pass and need no verification.

## How the PR comment behaves

- **Single comment per PR.** Subsequent runs UPDATE the existing comment via
  a hidden `<!-- oraclebot-scan:<run-prefix> -->` marker. No comment spam.
- The comment includes: score with grade, target URL, packs, findings
  breakdown by severity, top 8 findings with probe IDs, link to the full
  report, and the public badge.

## Privacy + security

- The action sends no data to OracleBot beyond the inputs you provide.
- The token is server-validated; raw token never leaves Bearer header.
- Findings persist in the OracleBot platform for the duration of your
  retention policy.
- Probes are read-only (GET, OPTIONS, scan-only POST against LLM endpoints
  with bogus credentials). See the [probe catalog](https://oraclebot.net/ai-built-apps).
