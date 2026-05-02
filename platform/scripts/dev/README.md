# Dev / testing scripts

Throwaway scripts for development and end-to-end testing. **Not for production
use.** Each one bypasses some part of the normal user flow (auth, wizard,
verification check) so we can exercise the platform without a live browser
session.

All scripts read `.env.local` from the platform root. Run with:

```sh
cd platform
NODE_OPTIONS='--require dotenv/config' DOTENV_CONFIG_PATH=.env.local \
  npx tsx scripts/dev/<script>.mts [args]
```

Or just `npx tsx scripts/dev/<script>.mts` if your shell already has the env
loaded.

## Scripts

### `seed-verification.mts [domain]`

Seeds a `verified` row in `target_verifications` for the given domain (default:
`oracle-bot-seven.vercel.app`) against the most-recently-created org. Returns
the verification id. Useful when you need a working badge URL without going
through the well-known-file or DNS-TXT flow.

### `find-active-org.mts`

Lists the top 5 orgs by latest run + the top 5 sessions by `expires_at` so you
can identify which org id the live UI session is using.

### `trigger-scan.mts [targetUrl]`

Creates and enqueues a new run with `mode=site`,
`packs=['web_classics','ai_built_apps']` against the given URL (default:
`https://oracle-bot-seven.vercel.app`). Bypasses the wizard, so no live
session is needed. Picks the first member of the hardcoded testing org.

### `check-run.mts <runId>`

Prints run row, last 20 events, and full findings list. The fastest way to
see what a worker is doing without tailing the worker logs.

### `cancel-run.mts <runId>`

Forcibly sets `status='canceled'` on the run row. Use only when a stuck or
mis-targeted run needs to be killed without going through the normal cancel
flow.

## Why these are separate

- They write to the database directly (bypassing API validation).
- They reference hardcoded org IDs.
- They are stateful — `seed-verification` mutates rows.

For real testing flows, use the platform UI or the `/api/runs` HTTP endpoint.
