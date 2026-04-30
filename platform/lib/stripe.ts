/**
 * Stripe SDK singleton + helpers.
 *
 * Use `stripe()` (lazy) so import-time evaluation doesn't crash when the
 * env var is missing in dev (e.g., during static analysis or unrelated code paths).
 */
import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  _stripe = new Stripe(key, {
    apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: { name: 'Oracle Bot', version: '0.2.0', url: 'https://oraclebot.net' },
  });
  return _stripe;
}

/**
 * Get-or-create a Stripe customer for an org. Idempotent — safe to call from
 * many places. Returns the Stripe customer ID.
 */
export async function ensureStripeCustomer(opts: {
  orgId: string;
  orgName: string;
  email?: string;
  existingStripeCustomerId?: string | null;
}): Promise<string> {
  if (opts.existingStripeCustomerId) return opts.existingStripeCustomerId;
  const customer = await stripe().customers.create({
    name: opts.orgName,
    email: opts.email,
    metadata: { oracle_bot_org_id: opts.orgId },
  });
  return customer.id;
}

/**
 * Verify a Stripe webhook signature. Returns the parsed event or throws.
 * Required to be called from the webhook route handler before trusting the
 * payload.
 */
export function verifyStripeWebhook(rawBody: string, signature: string | null): Stripe.Event {
  if (!signature) throw new Error('Missing stripe-signature header');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  return stripe().webhooks.constructEvent(rawBody, signature, secret);
}
