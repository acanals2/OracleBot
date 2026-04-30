/**
 * Validated environment for the platform (Next.js).
 *
 * Importing this module triggers Zod validation. If a required var is missing
 * or malformed, we throw a single human-readable error listing every problem
 * so misconfigurations fail fast at boot instead of producing 500s later.
 *
 * Use the typed `env` export everywhere instead of reading process.env directly.
 */
import { z } from 'zod';

const NodeEnv = z.enum(['development', 'test', 'production']).default('development');

const Schema = z.object({
  NODE_ENV: NodeEnv,

  // Database
  DATABASE_URL: z.string().url(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(32, 'must be ≥32 chars'),
  BETTER_AUTH_URL: z.string().url(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url(),

  // Queue
  REDIS_URL: z.string().url(),

  // Observability — DSN is optional in dev so the app still runs without Sentry.
  // In production we recommend setting it; we warn but don't fail.
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

  // Optional integrations (off by default)
  ANTHROPIC_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  E2B_API_KEY: z.string().optional(),
  INTERNAL_API_SECRET: z.string().optional(),

  // Dev affordances
  NEXT_PUBLIC_DEV_BUTTONS: z.string().optional(),
});

function format(error: z.ZodError): string {
  const lines = error.issues.map((i) => {
    const path = i.path.join('.') || '(root)';
    return `  - ${path}: ${i.message}`;
  });
  return [
    'Invalid environment configuration:',
    ...lines,
    '',
    'Check platform/.env.local and your deployment env.',
  ].join('\n');
}

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  // Throwing here is the entire point — Next will surface this clearly.
  throw new Error(format(parsed.error));
}

export const env = parsed.data;
export type Env = typeof env;
