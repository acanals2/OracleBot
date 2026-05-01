/**
 * Idempotent sync of the local product catalog (lib/billing.ts) to Stripe.
 *
 * Why this exists:
 *   Plans should be versioned in code, not in the Stripe dashboard. This
 *   script reads PRODUCTS from lib/billing.ts and ensures Stripe has a
 *   matching Product + Price for each non-free, non-metered tier. It can
 *   be run repeatedly — second run is a no-op.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe/sync.ts
 *
 *   Optional flags:
 *     --dry-run      Print what would happen, don't write to Stripe.
 *     --recreate     Delete + recreate all matching prices (use only when
 *                    priceCents in lib/billing.ts changes; Stripe Prices
 *                    are immutable).
 *
 * Output:
 *   For each product, prints the Stripe price ID and the matching env-var
 *   name. Copy these into Vercel + Railway env so getStripePriceId() can
 *   find them at runtime.
 *
 * Idempotency mechanism:
 *   Each Stripe Product carries metadata.oraclebot_key = product.key.
 *   We list all products with non-empty metadata, find the one whose key
 *   matches, and update it in place. If no match exists, create new.
 *   For Prices we list active prices on the product and look for one with
 *   matching unit_amount + interval; if found, reuse, otherwise create
 *   new (and deactivate the old one if --recreate is set).
 */
import Stripe from 'stripe';
import { PRODUCTS, type Product } from '../../lib/billing';

interface SyncOpts {
  dryRun: boolean;
  recreate: boolean;
}

const METADATA_KEY = 'oraclebot_key';

function parseArgs(): SyncOpts {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has('--dry-run'),
    recreate: args.has('--recreate'),
  };
}

function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const prefix = level === 'error' ? '✗' : level === 'warn' ? '!' : '·';
  // Use console because this is a CLI script; structured logger is for the server.
  // eslint-disable-next-line no-console
  console.log(`${prefix} ${message}`);
}

async function findOrCreateProduct(
  stripe: Stripe,
  product: Product,
  opts: SyncOpts,
): Promise<Stripe.Product | null> {
  // List products and filter by metadata.oraclebot_key. Stripe doesn't
  // support metadata filtering server-side, so we paginate.
  let existing: Stripe.Product | undefined;
  for await (const p of stripe.products.list({ limit: 100, active: true })) {
    if (p.metadata?.[METADATA_KEY] === product.key) {
      existing = p;
      break;
    }
  }

  const desired: Stripe.ProductUpdateParams = {
    name: `Oracle Bot — ${product.name}`,
    description: product.summary,
    metadata: { [METADATA_KEY]: product.key },
  };

  if (existing) {
    if (opts.dryRun) {
      log(`[dry-run] would UPDATE product ${existing.id} (${product.key})`);
      return existing;
    }
    const updated = await stripe.products.update(existing.id, desired);
    log(`updated product ${updated.id} (${product.key})`);
    return updated;
  }

  if (opts.dryRun) {
    log(`[dry-run] would CREATE product (${product.key})`);
    return null;
  }
  const created = await stripe.products.create({
    name: desired.name!,
    description: typeof desired.description === 'string' ? desired.description : undefined,
    metadata: desired.metadata as Record<string, string>,
  });
  log(`created product ${created.id} (${product.key})`);
  return created;
}

async function findOrCreatePrice(
  stripe: Stripe,
  stripeProduct: Stripe.Product,
  product: Product,
  opts: SyncOpts,
): Promise<Stripe.Price | null> {
  const interval =
    product.cadence === 'per month'
      ? 'month'
      : product.cadence === 'per persona-minute'
        ? null // metered prices are usage-based, not handled here
        : null;

  // List active prices on the product.
  const prices = await stripe.prices.list({
    product: stripeProduct.id,
    active: true,
    limit: 100,
  });

  const match = prices.data.find(
    (p) =>
      p.unit_amount === product.priceCents &&
      (interval ? p.recurring?.interval === interval : !p.recurring),
  );

  if (match && !opts.recreate) {
    log(`reusing price ${match.id} (${product.key}) — ${formatCents(match.unit_amount)}`);
    return match;
  }

  if (opts.recreate && match) {
    if (opts.dryRun) {
      log(`[dry-run] would DEACTIVATE price ${match.id}`);
    } else {
      await stripe.prices.update(match.id, { active: false });
      log(`deactivated price ${match.id} (recreate)`, 'warn');
    }
  }

  const params: Stripe.PriceCreateParams = {
    product: stripeProduct.id,
    currency: 'usd',
    unit_amount: product.priceCents,
    metadata: { [METADATA_KEY]: product.key },
    ...(interval ? { recurring: { interval } } : {}),
  };

  if (opts.dryRun) {
    log(`[dry-run] would CREATE price (${product.key}) — ${formatCents(product.priceCents)}${interval ? ` /${interval}` : ''}`);
    return null;
  }
  const created = await stripe.prices.create(params);
  log(`created price ${created.id} (${product.key}) — ${formatCents(created.unit_amount)}${interval ? ` /${interval}` : ''}`);
  return created;
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const opts = parseArgs();
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    log('STRIPE_SECRET_KEY is not set. Aborting.', 'error');
    process.exit(1);
  }

  const stripe = new Stripe(secret);
  log(`connected to Stripe in ${secret.startsWith('sk_test_') ? 'TEST' : 'LIVE'} mode`);
  if (opts.dryRun) log('--dry-run: no writes will be performed', 'warn');
  if (opts.recreate) log('--recreate: matching prices will be deactivated and re-created', 'warn');

  // Filter to billable products. Free is virtual; metered (overage) needs
  // special handling we'll add in a later phase.
  const billable = PRODUCTS.filter(
    (p) => p.type !== 'free' && p.type !== 'metered' && p.stripePriceEnvVar,
  );

  const results: Array<{ key: string; envVar: string; priceId: string | null }> = [];
  for (const product of billable) {
    log(`syncing ${product.key} …`);
    const stripeProduct = await findOrCreateProduct(stripe, product, opts);
    if (!stripeProduct) {
      results.push({ key: product.key, envVar: product.stripePriceEnvVar!, priceId: null });
      continue;
    }
    const stripePrice = await findOrCreatePrice(stripe, stripeProduct, product, opts);
    results.push({
      key: product.key,
      envVar: product.stripePriceEnvVar!,
      priceId: stripePrice?.id ?? null,
    });
  }

  // Print env-var summary.
  // eslint-disable-next-line no-console
  console.log('\n=== ENV VARS (copy to Vercel + Railway) ===');
  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(`${r.envVar}=${r.priceId ?? '<not-created — re-run without --dry-run>'}`);
  }
  // eslint-disable-next-line no-console
  console.log('===========================================\n');
  log('sync complete');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('FATAL:', err);
  process.exit(1);
});
