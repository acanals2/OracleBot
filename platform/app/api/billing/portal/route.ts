/**
 * POST /api/billing/portal  — open the Stripe customer portal so users can
 * update payment methods, cancel, or download invoices.
 */
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { apiError } from '@/lib/api-helpers';
import { stripe } from '@/lib/stripe';

export async function POST() {
  try {
    const session = await requireSession();
    if (!session.org.stripeCustomerId) {
      return new Response('No billing account yet — buy something first.', { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

    const portal = await stripe().billingPortal.sessions.create({
      customer: session.org.stripeCustomerId,
      return_url: `${appUrl}/app/billing`,
    });

    return redirect(portal.url);
  } catch (e) {
    return apiError(e);
  }
}
