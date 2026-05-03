# Deploy runbook

Two services to ship: a Next.js platform on **Vercel**, and a BullMQ worker on
**Railway**. Postgres is **Neon**, Redis is **Railway**.

---

## One-time setup

### 1. Vercel (platform)

1. Sign in at vercel.com with the account that should own the project.
2. **Add New… → Project** → select `acanals2/OracleBot` from GitHub.
3. Framework preset: **Next.js**.
4. **Root Directory: set to `platform`.** Critical — Vercel reads the
   package.json at the configured Root Directory to detect Next.js. The
   repo-root `package.json` is a monorepo orchestrator with no `next`
   dependency, so leaving Root at `./` fails detection. `platform/vercel.json`
   adds the `--legacy-peer-deps` install flag.
5. **Don't deploy yet.** Add env vars first (Settings → Environment Variables, scope = Production):

| Key | Value source | Notes |
|---|---|---|
| `DATABASE_URL` | Neon project | Pooled URL with `?sslmode=require` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | Rotate per environment |
| `BETTER_AUTH_URL` | `https://oraclebot.net` | Match deployed domain |
| `NEXT_PUBLIC_APP_URL` | Same as above | Read on the client |
| `REDIS_URL` | Railway Redis (public proxy URL) | Web only enqueues; public URL is fine |
| `ANTHROPIC_API_KEY` | Anthropic console | Required for adversarial bot generation |
| `INTERNAL_API_SECRET` | `openssl rand -base64 32` | Must match worker value |
| `SENTRY_DSN` | Sentry web project | Server-side error capture |
| `NEXT_PUBLIC_SENTRY_DSN` | Same Sentry web DSN | Browser error capture |
| `SENTRY_AUTH_TOKEN` | Sentry org settings | Source-map upload during build |

6. Click **Deploy**. First build takes ~3 min.

### 2. Railway (Redis + worker)

You should already have a Railway project containing Redis. Add the worker:

1. **+ New Service → Deploy from GitHub** → select `acanals2/OracleBot`.
2. **Settings → Service → Root Directory** = `worker` (this is critical —
   it makes `worker/` the Docker build context so the Dockerfile's
   `COPY package-lock.json` resolves; without it Railway uses repo root
   where no lock file lives).
3. **Settings → Build** = Dockerfile (auto-detected via `railway.toml`,
   path resolves to `worker/Dockerfile`).
4. **Settings → Variables** — paste these (use the **private** Redis URL from
   the Redis service in this project — copy the variable named
   `REDIS_PRIVATE_URL` or build it as `redis://default:<password>@redis.railway.internal:6379`):

| Key | Value |
|---|---|
| `DATABASE_URL` | Same Neon URL as the platform |
| `REDIS_URL` | Private Railway URL (`redis.railway.internal:6379`) |
| `ANTHROPIC_API_KEY` | Same as platform |
| `INTERNAL_API_SECRET` | Same as platform |
| `SENTRY_DSN` | Sentry **worker** project DSN (different from web) |
| `RESEND_API_KEY` | Empty for now; fill in Phase 6 |
| `RESEND_FROM_EMAIL` | `Oracle Bot <hello@oraclebot.net>` |
| `WORKER_RUN_CONCURRENCY` | `4` |
| `WORKER_EMAIL_CONCURRENCY` | `16` |
| `PORT_HEALTH` | `8080` (Railway auto-detects this from `railway.toml`) |

5. **Deploy**. Watch the Logs tab for the structured `worker.up` JSON line.
6. Healthcheck: `https://<your-worker>.up.railway.app/readyz` should return
   `{"ok":true,"checks":{"redis":"ok","db":"ok"}}`.

### 3. GitHub Actions (CI + deploy-worker)

Two workflows ship in `.github/workflows/`:

- `ci.yml` runs on every PR and push to `main`: typechecks both trees and
  builds the worker image (no push).
- `deploy-worker.yml` runs on push to `main` (only when `worker/**` changes):
  redeploys the Railway worker service.

Required GitHub repo secret:
- `RAILWAY_TOKEN` — generate at Railway → Account → Tokens, scope to the
  Oracle Bot project. Add it under repo Settings → Secrets and variables → Actions.

Vercel auto-deploys via its GitHub integration; no token needed.

---

## Database migrations

Run from the platform tree against the production DB:

```bash
cd platform
DATABASE_URL='<prod-pooled-url>' npm run db:migrate
```

For the `dead_jobs` table introduced in Phase 2, the generated migration lives
under `platform/lib/db/migrations/` after running `npm run db:generate`.

---

## Rollback

### Vercel
**Deployments** tab → find the previous green deploy → **⋯ → Promote to Production**.
Takes ~5 seconds (no rebuild).

### Railway worker
**Deployments** tab → previous deploy → **Redeploy**. Takes ~30s.
Dead-letter jobs that landed during the bad deploy stay in the `dead_jobs`
table and can be re-enqueued via the admin route once the rollback is healthy.

---

## Smoke test after deploy

1. Open `https://oraclebot.net/` — landing page renders.
2. Sign in (dev button if `NEXT_PUBLIC_DEV_BUTTONS=1`, otherwise email/password).
3. **Run a test** with mode = Site, target = `https://example.com`.
4. Watch the live monitor — metrics should tick within ~15 seconds.
5. Run completes with a non-mock readiness score and at least one finding.
6. Worker logs in Railway show `run.completed` JSON event.

If any step fails, check `GET /api/admin/dead-jobs` (org-owner only) for
exhausted-retry jobs and Sentry for unhandled errors.

---

## Operations checklist (manual, in your hands)

These are the operator-side actions that keep the system healthy. None of
them are code; they're things the operator does on Railway / Vercel / DNS.

### Worker readiness probe

The worker exposes two health endpoints:

- `GET /healthz` — returns 200 as long as the Node process is alive.
  **Do NOT use this as Railway's healthcheck.** It will return 200 even when
  Redis is down or the DB is unreachable, and Railway will keep routing to
  a half-broken worker.
- `GET /readyz` — returns 200 only when both Redis (`PING`) and Postgres
  (`SELECT 1`) succeed. **This is the one Railway should probe.**

Railway healthcheck path: `/readyz`. Verify in Railway → service →
Settings → Healthcheck → Path is `/readyz` (not `/healthz`).

If `/readyz` ever returns 503, the response body has the failing checks:

```json
{"ok":false,"checks":{"redis":"timeout","db":"ok"}}
```

Common fixes:
- `redis: timeout` — Redis service down or `REDIS_URL` env var pointing at
  the wrong instance. Restart the Redis service in Railway.
- `db: ECONNRESET` — Neon connection pool stale. Worker auto-reconnects,
  but if it persists, restart the worker service.

### oraclebot.net DNS

The marketing site lives at the repo root (`index.html`, `ai-built-apps.html`,
`probes.html`, `trading.html`, etc) and deploys to Vercel from the **root**
of the repo as a separate Vercel project (separate from `platform/`).

Required DNS records on the apex domain:

| Type | Name | Value | Notes |
| --- | --- | --- | --- |
| A | `@` (apex) | `76.76.21.21` | Vercel apex IP. Use Vercel's CNAME flattening if your registrar supports it. |
| CNAME | `www` | `cname.vercel-dns.com` | |

Verify:
- `dig oraclebot.net +short` returns Vercel IPs
- `https://oraclebot.net/` serves the marketing hero (`<title>` starts with "OracleBot")
- `https://oraclebot.net/probes.html` lists the 48-probe catalogue
- `https://oraclebot.net/api/badge/<verificationId>.svg` (proxied to the
  platform Vercel project) returns the readiness badge SVG

If `https://oraclebot.net/` shows a different product ("Oracle · build
anything, live" or similar placeholder), the apex is pointing at the wrong
Vercel project. Fix in Vercel → marketing project → Settings → Domains →
add `oraclebot.net` and `www.oraclebot.net`, remove from any other project.

### Post-deploy verification one-liner

```sh
curl -s https://<worker-host>/readyz | jq .
curl -s -o /dev/null -w '%{http_code}\n' https://oraclebot.net/probes.html
```

Both should report `{"ok":true,...}` and `200` respectively.
