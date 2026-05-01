# Billing runbook

Phase 4 of the Oracle Bot roadmap wires Stripe billing to the platform.
This doc covers initial setup, local dev, debugging, and the manual smoke
test that proves the integration works end-to-end.

The catalog (Free / Scout / Builder / Studio / Stack / Overage) lives in
[`platform/lib/billing.ts`](../platform/lib/billing.ts). Stripe is just a
mirror; everything pricing-related stays versioned in code.

---

## Initial setup

### 1. Create a Stripe account

If you don't already have one, sign up at https://stripe.com. Stay in
**test mode** until everything below passes; switch to live mode last.

Grab two values from the dashboard:
- **Publishable key** → `pk_test_…` or `pk_live_…`
- **Secret key** → `sk_test_…` or `sk_live_…`

### 2. Sync products + prices to Stripe

The sync script reads `lib/billing.ts` and creates / updates Stripe
products and prices to match. Idempotent — second run is a no-op.

```bash
cd platform
STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe/sync.ts
```

It prints a block at the end:

```
=== ENV VARS (copy to Vercel + Railway) ===
STRIPE_PRICE_SCOUT_RUN=price_1Abc...
STRIPE_PRICE_BUILDER_RUN=price_1Bcd...
STRIPE_PRICE_STUDIO_MONTHLY=price_1Cde...
STRIPE_PRICE_STACK_MONTHLY=price_1Def...
===========================================
```

Add those env vars (plus `STRIPE_SECRET_KEY` and
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) to:
- **Vercel**: `vercel env add <NAME> production` for each
- **Railway worker**: paste into the worker service's Variables tab

### 3. Configure the webhook endpoint

In the Stripe dashboard:
1. Developers → Webhooks → **Add endpoint**
2. URL: `https://oracle-bot-seven.vercel.app/api/webhooks/stripe`
3. Events to send (select these explicitly):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Save → click "Reveal" on the **Signing secret** (`whsec_...`)
5. Add to Vercel: `STRIPE_WEBHOOK_SECRET=whsec_...`
6. Trigger a redeploy so the new env takes effect

### 4. Configure the Customer Portal

Stripe → Settings → Billing → **Customer portal** → enable.
Allow customers to:
- Cancel subscriptions
- Update payment methods
- View invoices

The platform redirects to this portal from `/app/billing` via
`POST /api/billing/portal`.

---

## Local development with the Stripe CLI

The Stripe CLI tunnels webhooks from Stripe to your localhost.

```bash
# Install (macOS)
brew install stripe/stripe-cli/stripe
stripe login

# Forward webhooks while developing
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# It prints a fresh webhook signing secret for local use:
#   > Ready! Your webhook signing secret is whsec_...
# Put that in platform/.env.local as STRIPE_WEBHOOK_SECRET (local only).
```

Trigger specific events without going through real checkouts:

```bash
stripe trigger checkout.session.completed
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.deleted
```

Each fires a real test event against your local handler.

---

## Idempotency

Every webhook event is recorded in the `webhook_events` table keyed by
`event.id`. The PRIMARY KEY is the lock — duplicate events early-return
without running the handler twice.

To force a manual retry of an event whose handler errored:

```sql
DELETE FROM webhook_events WHERE id = 'evt_...';
```

Then `stripe events resend evt_...` from the CLI, or wait for Stripe's
automatic retry (~3 days).

To inspect failures:

```sql
SELECT id, type, error, received_at
FROM webhook_events
WHERE error IS NOT NULL
ORDER BY received_at DESC LIMIT 20;
```

---

## Smoke test (test mode)

This proves the end-to-end loop. Estimated time: ~10 min.

1. **Sign in** to https://oracle-bot-seven.vercel.app
2. **Free-tier path**: launch a run with `productKey=free`. Confirm:
   - Run accepted
   - Billing page shows "2 of 3 free runs remaining this month"
3. **Buy a credit**:
   - Billing → "Buy Builder" → use card `4242 4242 4242 4242`,
     any future expiry, any CVC, any ZIP
   - Stripe redirects back; webhook fires; `usage_credits` row inserted
   - Billing page now shows "1 Builder credit"
4. **Run a Builder run**: confirm entitlement check passes; on
   completion, worker logs `run.credit_consumed` with `consumed=true`;
   billing page now shows "0 Builder credits"
5. **Idempotent replay** (CLI):
   - Find the latest `evt_…` from `stripe events list --limit=5`
   - `stripe events resend evt_…`
   - Confirm `webhook_events` shows only one row, `usage_credits` did
     not double-grant
6. **Forged signature**:
   ```
   curl -i -X POST https://oracle-bot-seven.vercel.app/api/webhooks/stripe \
     -H "stripe-signature: bogus" -d 'not even json'
   ```
   Should return 400.
7. **Cancel the subscription** (after subscribing in step 5 if you
   chose Studio/Stack):
   - Open the customer portal from the billing page
   - Cancel
   - Webhook fires; `subscriptions.status` flips to `canceled`
   - Try to launch another run on `studio` → blocked with
     "No active studio subscription. Subscribe from the Billing page first."
8. **Race**: in dev, set `usage_credits.credits_remaining = 1` for one
   product; fire two `POST /api/runs` requests in parallel. Only one
   should succeed; the other returns 403 with a `no_entitlement` reason.

---

## Troubleshooting

**"Webhook signature verification failed"**
The `STRIPE_WEBHOOK_SECRET` env var doesn't match the endpoint that fired
the event. Re-copy the signing secret from the Stripe dashboard for the
webhook endpoint you're using (production endpoint vs `stripe listen`
secret are different values).

**"Subscription event for customer not linked to any org"**
The Stripe customer ID on the subscription doesn't match any
`orgs.stripe_customer_id`. Usually means the user hit Stripe directly
without going through `/api/billing/checkout` (which sets
`client_reference_id = orgId` and we use that to link). Manual fix:
update the org row with the matching customer id.

**"No entitlement" blocking a run that should be allowed**
Check `getEntitlements(orgId)` — query the `subscriptions`,
`usage_credits`, and `runs` (free counter) tables for that org. The order
of checks is documented in
[`lib/entitlements.ts`](../platform/lib/entitlements.ts).

**Sync script can't update an existing product**
`scripts/stripe/sync.ts` matches by `metadata.oraclebot_key`. If you
created products in the dashboard without that metadata, the script
won't find them and will create duplicates. Fix: in the dashboard, edit
the existing product → Metadata → add `oraclebot_key=<product.key>`,
save, then re-run the script.

---

## What this implementation does NOT yet do

- **Metered overage submission to Stripe.** The catalog has
  `overage_persona_min` at $0.04, but `lib/billing.ts → estimateRunCostCents`
  computes overage locally; we never report meter events to Stripe. Add
  in a follow-up phase before live launch.
- **Annual / contact-sale plans.** Catalog only has month-to-month.
- **Free-tier reset on plan change.** A canceled subscription doesn't
  re-grant free runs in the same calendar month — they reset on the 1st.
- **Test isolation.** No automated test harness yet; smoke is manual.
