/**
 * Billing catalog — single source of truth for product tiers shown on the
 * landing page, billing page, and checkout.
 *
 * Naming convention:
 *   - "credit" products = one-shot per-run charges (Scout, Builder)
 *   - "subscription" products = recurring monthly (Studio, Stack)
 *   - "metered" products = pay-as-you-go overage (per persona-minute)
 *
 * Stripe Price IDs come from env so the same code works in test + live mode
 * without branching.
 */

export type ProductType = 'free' | 'credit' | 'subscription' | 'metered';

/**
 * Number of free-tier runs an org gets per calendar month before they need
 * to buy credits or subscribe. Tracked by counting rows in `runs` with
 * `productKey === 'free'` and `created_at >= date_trunc('month', now())`.
 */
export const FREE_RUNS_PER_MONTH = 3;

export interface Product {
  key: string;
  name: string;
  type: ProductType;
  /** Display price (USD cents) */
  priceCents: number;
  /** Billing cadence label for UI */
  cadence: 'per run' | 'per month' | 'per persona-minute' | 'engagement';
  /** Bot count cap included in the tier */
  maxBots: number;
  /** Run duration cap (minutes) included in the tier */
  durationMinutes: number;
  /** Plain-English summary for cards */
  summary: string;
  /** Stripe Price ID — read at runtime from env */
  stripePriceEnvVar: string | null;
  /** Show in the public pricing grid? */
  publicListed: boolean;
  /** Order in cards (low → high) */
  sortOrder: number;
}

export const PRODUCTS: Product[] = [
  {
    key: 'free',
    name: 'Free',
    type: 'free',
    priceCents: 0,
    cadence: 'engagement',
    maxBots: 100,
    durationMinutes: 5,
    summary: `${FREE_RUNS_PER_MONTH} runs/month · 100 bots · 5 min`,
    stripePriceEnvVar: null,
    publicListed: true,
    sortOrder: 0,
  },
  {
    key: 'scout',
    name: 'Scout',
    type: 'credit',
    priceCents: 2900,
    cadence: 'per run',
    maxBots: 500,
    durationMinutes: 15,
    summary: '500 bots · 15 min · 1 mode',
    stripePriceEnvVar: 'STRIPE_PRICE_SCOUT_RUN',
    publicListed: true,
    sortOrder: 1,
  },
  {
    key: 'builder',
    name: 'Builder',
    type: 'credit',
    priceCents: 14900,
    cadence: 'per run',
    maxBots: 5000,
    durationMinutes: 60,
    summary: '5k bots · 1 hr · all modes',
    stripePriceEnvVar: 'STRIPE_PRICE_BUILDER_RUN',
    publicListed: true,
    sortOrder: 2,
  },
  {
    key: 'studio',
    name: 'Studio',
    type: 'subscription',
    priceCents: 29900,
    cadence: 'per month',
    maxBots: 10000,
    durationMinutes: 60,
    summary: 'Unlimited runs · 10k bots',
    stripePriceEnvVar: 'STRIPE_PRICE_STUDIO_MONTHLY',
    publicListed: true,
    sortOrder: 3,
  },
  {
    key: 'stack',
    name: 'Stack',
    type: 'subscription',
    priceCents: 99900,
    cadence: 'per month',
    maxBots: 30000,
    durationMinutes: 120,
    summary: 'CI integration · custom personas · SSO',
    stripePriceEnvVar: 'STRIPE_PRICE_STACK_MONTHLY',
    publicListed: true,
    sortOrder: 4,
  },
  {
    key: 'overage_persona_min',
    name: 'Overage',
    type: 'metered',
    priceCents: 4, // $0.04 per persona-minute
    cadence: 'per persona-minute',
    maxBots: 0,
    durationMinutes: 0,
    summary: 'Beyond included cap',
    stripePriceEnvVar: 'STRIPE_PRICE_OVERAGE_PERSONA_MIN',
    publicListed: false,
    sortOrder: 99,
  },
];

export const PRODUCT_BY_KEY: Record<string, Product> = PRODUCTS.reduce(
  (acc, p) => ({ ...acc, [p.key]: p }),
  {},
);

export function getStripePriceId(key: string): string | null {
  const product = PRODUCT_BY_KEY[key];
  if (!product?.stripePriceEnvVar) return null;
  return process.env[product.stripePriceEnvVar] ?? null;
}

/**
 * Estimate run cost for a given config (in cents). Used to display "estimated
 * cost" on the New Run wizard and to enforce hard caps.
 *
 * Formula: included tier price + (overage personaMinutes × overage rate).
 */
export function estimateRunCostCents(opts: {
  productKey: string;
  botCount: number;
  durationMinutes: number;
}): number {
  const product = PRODUCT_BY_KEY[opts.productKey];
  if (!product) return 0;

  const includedPersonaMinutes = product.maxBots * product.durationMinutes;
  const requestedPersonaMinutes = opts.botCount * opts.durationMinutes;
  const overagePersonaMinutes = Math.max(0, requestedPersonaMinutes - includedPersonaMinutes);

  const overage = PRODUCT_BY_KEY['overage_persona_min']!;
  return product.priceCents + overagePersonaMinutes * overage.priceCents;
}

export function formatPrice(cents: number): string {
  if (cents % 100 === 0) return `$${cents / 100}`;
  return `$${(cents / 100).toFixed(2)}`;
}
