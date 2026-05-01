/**
 * POST /api/webhooks/stripe  — handle Stripe webhook events.
 *
 * Reads the *raw body* (not parsed JSON) so signature verification works.
 *
 * Idempotency:
 *   We persist every received event in `webhook_events` keyed by
 *   `event.id` (Stripe's stable event ID). The PRIMARY KEY is the
 *   idempotency lock — a duplicate event hitting the endpoint cannot
 *   double-grant credits or duplicate subscription rows because the
 *   second insert is a no-op and we early-return.
 *
 *   If the handler throws mid-processing the row stays with `processedAt`
 *   null. Stripe's automatic retries (~3 days) will re-fire the event
 *   and we'll try again. To force a manual retry, clear the row from
 *   the table.
 *
 * Events we handle:
 *   - checkout.session.completed       grant credit OR mark customer-org link
 *   - customer.subscription.created    upsert sub row
 *   - customer.subscription.updated    upsert sub row
 *   - customer.subscription.deleted    mark canceled
 *   - invoice.payment_succeeded        renew period (re-fetch sub)
 *   - invoice.payment_failed           mark sub past_due (Phase 4)
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { stripe, verifyStripeWebhook } from '@/lib/stripe';
import { db } from '@/lib/db';
import { orgs, subscriptions, usageCredits, webhookEvents } from '@/lib/db/schema';
import type { Logger } from 'pino';
import { logger, newTraceId } from '@/lib/logger';

export const runtime = 'nodejs'; // node only — needs raw body
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  const log = logger.child({ traceId, route: '/api/webhooks/stripe' });

  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(raw, sig);
  } catch (e) {
    log.warn(
      { event: 'stripe_webhook.bad_signature', err: (e as Error).message },
      'signature verification failed',
    );
    return new NextResponse('bad signature', { status: 400 });
  }

  // ── Idempotency lock ──────────────────────────────────────────────────
  const insertResult = await db
    .insert(webhookEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing({ target: webhookEvents.id })
    .returning({ id: webhookEvents.id });

  if (insertResult.length === 0) {
    // Duplicate event. Check whether the previous attempt finished.
    const existing = await db.query.webhookEvents.findFirst({
      where: eq(webhookEvents.id, event.id),
    });
    if (existing?.processedAt) {
      log.info(
        { event: 'stripe_webhook.idempotent_replay', stripeEventId: event.id, type: event.type },
        'replay of already-processed event',
      );
      return NextResponse.json({ received: true, idempotent_replay: true });
    }
    // The previous attempt is still in-flight or errored; let it own the
    // work. Stripe will retry the event for us.
    log.warn(
      { event: 'stripe_webhook.in_flight_replay', stripeEventId: event.id, type: event.type },
      'replay while previous attempt unfinished; declining (will retry)',
    );
    return NextResponse.json({ received: true, in_flight: true });
  }

  // ── Handle ────────────────────────────────────────────────────────────
  try {
    await handleEvent(event, log);
    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, event.id));
    log.info(
      { event: 'stripe_webhook.processed', stripeEventId: event.id, type: event.type },
      'webhook processed',
    );
    return NextResponse.json({ received: true });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    log.error(
      { event: 'stripe_webhook.handler_error', stripeEventId: event.id, type: event.type, err: errMsg },
      'webhook handler threw',
    );
    // Persist the error for ops visibility; leave processedAt null so a
    // Stripe retry (or manual replay) re-runs the handler.
    await db
      .update(webhookEvents)
      .set({ error: errMsg })
      .where(eq(webhookEvents.id, event.id));
    return new NextResponse('internal', { status: 500 });
  }
}

async function handleEvent(event: Stripe.Event, log: Logger) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const sess = event.data.object as Stripe.Checkout.Session;
      const orgId = sess.client_reference_id ?? sess.metadata?.oracle_bot_org_id;
      const productKey = sess.metadata?.oracle_bot_product_key;
      if (!orgId || !productKey) {
        log.warn(
          { event: 'stripe_webhook.checkout_missing_metadata', sessionId: sess.id },
          'checkout.session.completed without orgId/productKey metadata; ignoring',
        );
        break;
      }

      if (sess.mode === 'payment') {
        await db.insert(usageCredits).values({
          orgId,
          productKey,
          creditsRemaining: 1,
          creditsPurchased: 1,
          stripePaymentIntentId:
            typeof sess.payment_intent === 'string' ? sess.payment_intent : undefined,
        });
        log.info(
          { event: 'stripe_webhook.credit_granted', orgId, productKey },
          'credit granted from checkout',
        );
      } else if (sess.mode === 'subscription' && sess.subscription) {
        // The detailed `customer.subscription.created` event fires next; we
        // upsert there. Just ensure stripeCustomerId is on the org.
        if (typeof sess.customer === 'string') {
          await db
            .update(orgs)
            .set({ stripeCustomerId: sess.customer, updatedAt: new Date() })
            .where(eq(orgs.id, orgId));
        }
        log.info(
          { event: 'stripe_webhook.subscription_checkout_linked', orgId },
          'org linked to stripe customer; sub row populated by next event',
        );
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await upsertSubscription(sub, log);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .update(subscriptions)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      log.info(
        { event: 'stripe_webhook.subscription_canceled', stripeSubscriptionId: sub.id },
        'subscription canceled',
      );
      break;
    }

    case 'invoice.payment_succeeded': {
      const inv = event.data.object as Stripe.Invoice;
      if (inv.subscription && typeof inv.subscription === 'string') {
        const fresh = await stripe().subscriptions.retrieve(inv.subscription);
        await upsertSubscription(fresh, log);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      if (inv.subscription && typeof inv.subscription === 'string') {
        // Mark sub past_due. Stripe will retry; if it eventually fails, we
        // get customer.subscription.updated with status=unpaid then deleted.
        // Run gating in lib/entitlements.ts treats past_due as inactive
        // (only 'active' and 'trialing' allow runs), so this hop is the
        // mechanism that actually pauses runs on a failed renewal.
        await db
          .update(subscriptions)
          .set({ status: 'past_due', updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, inv.subscription));
        log.warn(
          {
            event: 'stripe_webhook.invoice_payment_failed',
            stripeSubscriptionId: inv.subscription,
            invoiceId: inv.id,
          },
          'invoice payment failed; subscription marked past_due',
        );
      }
      break;
    }

    default:
      log.debug(
        { event: 'stripe_webhook.unhandled_type', type: event.type },
        'unhandled event type; ignoring',
      );
      break;
  }
}

async function upsertSubscription(sub: Stripe.Subscription, log: Logger) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.stripeCustomerId, customerId),
  });
  if (!org) {
    log.warn(
      { event: 'stripe_webhook.subscription_unknown_customer', customerId, stripeSubscriptionId: sub.id },
      'subscription event for customer not linked to any org',
    );
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price.id;

  // Reverse-map price ID → product key by scanning STRIPE_PRICE_* env vars.
  let productKey: string | undefined;
  for (const [key, val] of Object.entries(process.env)) {
    if (key.startsWith('STRIPE_PRICE_') && val === priceId) {
      productKey = key
        .replace('STRIPE_PRICE_', '')
        .toLowerCase()
        .replace('_monthly', '')
        .replace('_run', '');
      break;
    }
  }

  const values = {
    orgId: org.id,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId ?? '',
    productKey: productKey ?? 'unknown',
    status: sub.status as typeof subscriptions.$inferInsert.status,
    currentPeriodStart: new Date(sub.current_period_start * 1000),
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };

  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, sub.id),
  });
  if (existing) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
    log.info(
      { event: 'stripe_webhook.subscription_updated', orgId: org.id, stripeSubscriptionId: sub.id, status: values.status },
      'subscription updated',
    );
  } else {
    await db.insert(subscriptions).values(values);
    log.info(
      { event: 'stripe_webhook.subscription_created', orgId: org.id, stripeSubscriptionId: sub.id, status: values.status },
      'subscription created',
    );
  }
}
