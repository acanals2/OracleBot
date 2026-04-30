# Oracle Bot — Setup Guide

You're standing at the line where **code is done** and **credentials begin**.
This doc walks you through every account / key you'll need, in the order you
need them, with the exact env var name to copy each value into.

---

## Architecture in one picture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Vercel (Next.js)         platform/  ← marketing site + auth + API       │
│   ▶ Better Auth (self-hosted, sessions in Neon)                         │
│   ▶ Drizzle / Neon (Postgres)                                           │
│   ▶ Stripe (checkout + webhooks)                                        │
│   ▶ Resend (email enqueue)                                              │
│   ▶ BullMQ producer  ─────────────────────────┐                         │
└────────────────────────────────────────────────│────────────────────────┘
                                                 ▼ Redis queue
┌──────────────────────────────────────────────────────────────────────────┐
│ Railway (worker)         worker/   ← long-running BullMQ consumer       │
│   ▶ Drizzle / Neon (same DB)                                            │
│   ▶ Resend (sends emails)                                               │
│   ▶ Anthropic (later — AI fix loop)                                     │
│   ▶ E2B (later — sandbox provisioner)                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-step

### 0. Install dependencies

```bash
cd platform && npm install
cd ../worker && npm install
```

### 1. Neon (Postgres)

You said you have an account.

1. Open https://console.neon.tech → your Oracle Bot project (or create one)
2. Navigate to **Connection Details** → copy the **Pooled** connection string
3. Add to `platform/.env.local`:
   ```
   DATABASE_URL="postgresql://USER:PASS@HOST.neon.tech/oraclebot?sslmode=require"
   ```
4. Add the **same value** to `worker/.env`
5. Generate + apply schema:
   ```bash
   cd platform
   npm run db:generate   # creates SQL migration files in lib/db/migrations/
   npm run db:push       # applies the schema to Neon
   ```
6. (Optional) Open Drizzle Studio to verify:
   ```bash
   npm run db:studio
   ```

### 2. Better Auth (self-hosted on Neon)

No third-party signup needed. Better Auth runs in-process on the Next.js
server and stores sessions/users/orgs in the same Neon DB you set up in
step 1. You only need a strong session-signing secret.

1. Generate a secret:
   ```bash
   openssl rand -base64 32
   ```
2. Add to `platform/.env.local`:
   ```
   BETTER_AUTH_SECRET="<the-generated-secret>"
   BETTER_AUTH_URL="http://localhost:3000"  # production: https://oraclebot.net
   ```
3. The schema migration in step 1 already created the `users`, `sessions`,
   `accounts`, `verifications`, `orgs`, `members`, and `invitations` tables
   that Better Auth manages. Nothing else to provision.

To add OAuth (Google / GitHub) later:
   1. Get client ID + secret from Google Cloud or GitHub Developer Settings
   2. Add to `.env.local`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc.
   3. Uncomment the `socialProviders` block in `platform/lib/auth-config.ts`

### 3. Railway (Redis)

You said you have an account.

1. Open https://railway.app → your project
2. Add a **Redis** service if you don't have one
3. Open the Redis service → **Connect** tab → copy the **Private URL** (`redis://default:...@redis.railway.internal:6379`)
4. Add to **both** `platform/.env.local` AND `worker/.env`:
   ```
   REDIS_URL="redis://default:...@redis.railway.internal:6379"
   ```

### 4. Resend (email)

1. Open https://resend.com → API keys → create one
2. Copy the key:
   ```
   RESEND_API_KEY="re_..."
   RESEND_FROM_EMAIL="Oracle Bot <hello@oraclebot.net>"
   ```
3. Verify your sending domain (oraclebot.net) in Resend → Domains
4. Add same values to `worker/.env`

### 5. Stripe (billing)

1. Open https://dashboard.stripe.com → Developers → API keys
2. Copy both:
   ```
   STRIPE_SECRET_KEY="sk_test_..."
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
   ```
3. Create products + prices (Catalog → Products):
   - **Scout — $29 / one-time**           → copy price ID → `STRIPE_PRICE_SCOUT_RUN`
   - **Builder — $149 / one-time**        → `STRIPE_PRICE_BUILDER_RUN`
   - **Studio — $299 / month recurring**  → `STRIPE_PRICE_STUDIO_MONTHLY`
   - **Stack — $999 / month recurring**   → `STRIPE_PRICE_STACK_MONTHLY`
   - **Overage — $0.04 / persona-min, metered**  → `STRIPE_PRICE_OVERAGE_PERSONA_MIN`
4. Webhooks → add endpoint:
   - URL: `https://your-vercel-url.vercel.app/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_succeeded`
   - Copy the signing secret → `STRIPE_WEBHOOK_SECRET="whsec_..."`
5. (Local testing) Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   # use the printed whsec_ as your STRIPE_WEBHOOK_SECRET locally
   ```

### 6. Internal secret

Generate a random secret for cron / worker callbacks:
```bash
openssl rand -base64 32
```
Add to **both** `platform/.env.local` and `worker/.env`:
```
INTERNAL_API_SECRET="..."
```

### 7. App URL

`platform/.env.local`:
```
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```
In Vercel production, set this to `https://oraclebot.net`.

### 8. Anthropic (bot engine + AI fix loop)

The bot engine is now live. Add your API key to both envs:
```
ANTHROPIC_API_KEY="sk-ant-..."
```
Add to `platform/.env.local` AND `worker/.env`.

The worker uses `claude-haiku-4-5-20251001` for adversarial input generation
and response analysis (cheap + fast). Approximately $0.001–0.01 per run-minute
at typical bot counts.

### 9. E2B (sandbox provisioner for repo/docker targets)

Required only when submitting a `targetRepoUrl` or `targetDockerImage` run.
For `targetLiveUrl` and `targetAgentEndpoint` runs, E2B is skipped entirely.

```
E2B_API_KEY="e2b_..."
```
Add to `platform/.env.local` AND `worker/.env`.

To enable E2B preview isolation (instead of local `next dev` child processes):
```
ORACLE_PREVIEW_PROVIDER=e2b
```

#### Railway Playwright build requirement

The worker uses Playwright/Chromium for Site Mode and Stack Mode. When
deploying to Railway, the container needs Chromium system dependencies.
Add this to the Railway service's **Build Command** (or your Dockerfile):

```bash
npx playwright install-deps chromium && npx playwright install chromium
```

Or add to `worker/Dockerfile`:
```dockerfile
RUN npx playwright install-deps chromium && npx playwright install chromium
```

This is a one-time ~200 MB download at build time. Subsequent deploys use
Railway's layer cache. Without this step, Playwright will throw
`browserType.launch: Browser closed unexpectedly` at runtime.

---

## Run it locally

Three terminals:

```bash
# Terminal 1: web app
cd platform && npm run dev
# → http://localhost:3000

# Terminal 2: worker
cd worker && npm run dev

# Terminal 3: Stripe webhook tunnel
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Sign up at http://localhost:3000/sign-up → create an org → click "Run a
test" → you should see the run go through queued → provisioning → running →
completed in about 10 seconds (the mock processor walks the state machine).

---

## Deploy

### Web (Vercel)
- Import the GitHub repo into Vercel
- Set the **Root Directory** to repo root (NOT `platform/` — the `vercel.json`
  routes things correctly)
- Add all `platform/.env.example` vars in the Vercel project's env settings
- Push to main; auto-deploy

### Worker (Railway)
- Create a new Railway service, **Source**: GitHub repo, root `worker/`
- Railway auto-detects the Dockerfile
- Add all vars from `worker/.env.example`
- Deploy

---

## What's NOT wired (intentional)

1. **AI fix loop** — Claude reads findings + workspace code, proposes a patch,
   opens a PR. Types defined; wiring deferred.
2. **Email verification + invites** — Resend templates exist; Better Auth
   plugin hooks not yet called.
3. **CodeMirror editor** — workspace file editing is API-only; no in-browser
   editor yet.
4. **Stripe live keys** — test mode only; real product IDs not created.

Everything else — bot engine, sandbox provisioner, dashboard, billing,
queueing, persistence, emails, share links, audit trail — is fully wired.
