/**
 * POST /api/webhooks/stripe  — handle Stripe webhook events.
 *
 * IMPORTANT: this route reads the *raw body* (not parsed JSON) so signature
 * verification works. Don't add middleware that consumes the body upstream.
 *
 * Events we handle:
 *   - checkout.session.completed       → grant credit OR create subscription row
 *   - invoice.payment_succeeded        → renew subscription period
 *   - customer.subscription.updated    → status / period changes
 *   - customer.subscription.deleted    → mark canceled
 */
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { stripe, verifyStripeWebhook } from '@/lib/stripe';
import { db } from '@/lib/db';
import { orgs, subscriptions, usageCredits } from '@/lib/db/schema';

export const runtime = 'nodejs'; // node only — needs raw body
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(raw, sig);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[stripe webhook] signature verification failed', e);
    return new NextResponse('bad signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const sess = event.data.object as Stripe.Checkout.Session;
        const orgId = sess.client_reference_id ?? sess.metadata?.oracle_bot_org_id;
        const productKey = sess.metadata?.oracle_bot_product_key;
        if (!orgId || !productKey) break;

        if (sess.mode === 'payment') {
          // Per-run credit purchase
          await db.insert(usageCredits).values({
            orgId,
            productKey,
            creditsRemaining: 1,
            creditsPurchased: 1,
            stripePaymentIntentId:
              typeof sess.payment_intent === 'string' ? sess.payment_intent : undefined,
          });
        } else if (sess.mode === 'subscription' && sess.subscription) {
          // The detailed `customer.subscription.created` event fires next; we
          // upsert there. Just ensure stripeCustomerId is on the org.
          if (typeof sess.customer === 'string') {
            await db
              .update(orgs)
              .set({ stripeCustomerId: sess.customer, updatedAt: new Date() })
              .where(eq(orgs.id, orgId));
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(sub);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await db
          .update(subscriptions)
          .set({ status: 'canceled', updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, sub.id));
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription && typeof inv.subscription === 'string') {
          const fresh = await stripe().subscriptions.retrieve(inv.subscription);
          await upsertSubscription(fresh);
        }
        break;
      }

      default:
        // ignore
        break;
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[stripe webhook] handler error', e);
    return new NextResponse('internal', { status: 500 });
  }
}

async function upsertSubscription(sub: Stripe.Subscription) {
  // Find the org by stripe customer
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const org = await db.query.orgs.findFirst({
    where: eq(orgs.stripeCustomerId, customerId),
  });
  if (!org) {
    // eslint-disable-next-line no-console
    console.warn('[stripe webhook] subscription for unknown customer', customerId);
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price.id;
  // Reverse-map price ID → product key
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

  // Upsert by stripeSubscriptionId
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.stripeSubscriptionId, sub.id),
  });
  if (existing) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
  } else {
    await db.insert(subscriptions).values(values);
  }
}
