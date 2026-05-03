# @oraclebot/cli

OracleBot readiness scans from any shell. Pure Node 20, zero runtime
dependencies. Pairs with API tokens minted at
[oraclebot.net](https://oraclebot.net/app/settings/api-tokens).

## Install

```sh
# One-off
npx @oraclebot/cli scan https://staging.acme.dev

# Global
npm install -g @oraclebot/cli
oraclebot scan https://staging.acme.dev
```

## Auth

Three ways to provide an API token, in order of precedence:

1. `--token obt_…` flag
2. `ORACLEBOT_TOKEN` environment variable
3. `~/.oraclebot/token` file (mode 0600) — created by `oraclebot login`

Mint a token at <https://oraclebot.net/app/settings/api-tokens>.

## Commands

### `oraclebot scan <target-url>`

Run a scan, poll until completion, print the result.

```sh
oraclebot scan https://staging.acme.dev \
  --packs web_classics,ai_built_apps \
  --duration 3
```

| Flag                | Default                          | Notes |
| ---                 | ---                              | --- |
| `--packs`           | `web_classics,ai_built_apps`     | Comma-separated pack ids |
| `--product`         | `free`                           | Tier (free / scout / builder / studio / stack) |
| `--bots`            | `5`                              |  |
| `--duration`        | `3`                              | Minutes |
| `--name`            | `cli-<iso>`                      | Run name |
| `--no-wait`         | (off)                            | Queue and exit immediately |
| `--max-wait-min`    | `20`                             | Polling timeout |
| `--hard-cap-cents`  | `5000`                           | Hard cost cap |
| `--idempotency-key` | random                           | Reuse to dedupe retries |
| `--json`            | (off)                            | Machine-readable output |

Exit code: `0` if `status === completed`, `1` otherwise.

### `oraclebot status <run-id>`

```sh
oraclebot status 043c22e4-2315-41c9-9122-bddd6052f7a6
```

### `oraclebot whoami`

Confirms the token is valid and shows which org it belongs to.

```sh
oraclebot whoami
```

### `oraclebot verify <domain>`

Creates a verification challenge for a domain. Prints DNS-TXT or well-known-file
instructions.

```sh
oraclebot verify staging.acme.dev --method well_known_file
```

### `oraclebot login`

Interactive: pastes a token, writes it to `~/.oraclebot/token` mode 0600.

```sh
oraclebot login
# Paste your OracleBot API token (obt_…): obt_…
# ✓ Token saved to /Users/you/.oraclebot/token
```

## Scripting

`--json` output makes the CLI scriptable:

```sh
RESULT=$(oraclebot scan https://staging.acme.dev --json)
SCORE=$(echo "$RESULT" | jq -r '.score')
if [ "$SCORE" -lt 70 ]; then
  echo "Readiness too low: $SCORE"
  exit 1
fi
```

The shape returned by `--json`:

```json
{
  "runId": "043c22e4-…",
  "status": "completed",
  "score": 64,
  "findings": 6,
  "runUrl": "https://oraclebot.net/app/tests/043c22e4-…/results"
}
```

## Differences from the GitHub Action

The GitHub Action (`oraclebot/oraclebot-scan@v1`) is purpose-built for CI:
PR comments, GitHub Actions outputs, marker-based comment editing, GitHub
token permission flow.

The CLI is designed for everywhere else — local dev loops, shell scripts,
Terraform `local-exec`, deploy hooks in CI other than GitHub.

Both share the same API tokens and the same `/api/runs` endpoints.

## Privacy

The CLI sends no data to OracleBot beyond the inputs you provide. The token
never leaves the `Authorization` header.
