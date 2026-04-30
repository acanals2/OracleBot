/**
 * POST /api/billing/checkout  — create a Stripe Checkout Session for a product.
 *
 * Body: { productKey: 'scout' | 'builder' | 'studio' | 'stack' }
 *
 * For credit products we use mode=payment (one-shot). For subscriptions,
 * mode=subscription. Customer is auto-created on the org if missing.
 */
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { apiError, ok } from '@/lib/api-helpers';
import { ensureStripeCustomer, stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { orgs } from '@/lib/db/schema';
import { PRODUCT_BY_KEY, getStripePriceId } from '@/lib/billing';

const bodySchema = z.object({
  productKey: z.enum(['scout', 'builder', 'studio', 'stack']),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { productKey } = bodySchema.parse(await req.json());

    const product = PRODUCT_BY_KEY[productKey];
    if (!product) {
      return new Response('Unknown product', { status: 400 });
    }
    const stripePriceId = getStripePriceId(productKey);
    if (!stripePriceId) {
      return new Response(
        `Stripe price not configured (missing env: ${product.stripePriceEnvVar})`,
        { status: 500 },
      );
    }

    const customerId = await ensureStripeCustomer({
      orgId: session.org.id,
      orgName: session.org.name,
      email: session.user.email,
      existingStripeCustomerId: session.org.stripeCustomerId,
    });

    // Persist the customer ID back to the org row so we don't recreate.
    if (!session.org.stripeCustomerId) {
      await db
        .update(orgs)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(orgs.id, session.org.id));
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const checkout = await stripe().checkout.sessions.create({
      customer: customerId,
      mode: product.type === 'subscription' ? 'subscription' : 'payment',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/app/billing?status=success&product=${productKey}`,
      cancel_url: `${appUrl}/app/billing?status=canceled`,
      allow_promotion_codes: true,
      client_reference_id: session.org.id,
      metadata: {
        oracle_bot_org_id: session.org.id,
        oracle_bot_product_key: productKey,
      },
      // For one-shot credits, immediately add the credit count via webhook.
      ...(product.type === 'credit'
        ? { payment_intent_data: { metadata: { oracle_bot_credit_for: productKey } } }
        : {}),
    });

    return ok({ url: checkout.url });
  } catch (e) {
    return apiError(e);
  }
}
