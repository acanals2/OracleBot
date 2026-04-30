# Oracle Bot — Worker

Long-running BullMQ consumer. Runs three queues:

- **run-execution** — processes test runs (currently a stub; bot engine plugs in here)
- **email** — sends transactional emails via Resend
- **billing-reconciliation** — metered overage reconciliation (stub)

## Local development

```bash
cp .env.example .env
# fill in DATABASE_URL, REDIS_URL, RESEND_API_KEY at minimum

npm install
npm run dev
```

The platform enqueues jobs into the same Redis instance — start the platform
(`cd ../platform && npm run dev`) and click "Run a test" in the UI. The
worker will pick up the job and walk it through the (mock) state machine.

## Railway deployment

1. Create a new Railway service from this directory (`worker/`)
2. Add env vars from `.env.example`
3. Set start command to `npm start` (default from `package.json`)
4. Railway auto-detects the Dockerfile

## Schema sync

`src/schema.ts` is a copy of `platform/lib/db/schema.ts`. When the schema
changes, re-copy:

```bash
cp ../platform/lib/db/schema.ts ./src/schema.ts
```

(Same for `src/processors/email-templates/*.tsx` — copies of the platform
templates so the worker can render them without depending on the platform package.)
