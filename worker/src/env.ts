/**
 * Validated environment for the worker.
 *
 * This module MUST be the very first import in `index.ts`. The dotenv call
 * runs at module top-level so subsequent imports see populated process.env;
 * Zod validation runs immediately after so misconfigurations fail fast.
 *
 * Use the typed `env` export everywhere instead of reading process.env directly.
 */
import dotenv from 'dotenv';
dotenv.config({ override: true });

import { z } from 'zod';

const NodeEnv = z.enum(['development', 'test', 'production']).default('development');

const Schema = z.object({
  NODE_ENV: NodeEnv,

  // Shared infra
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Required for run execution
  ANTHROPIC_API_KEY: z.string().min(1, 'required for adversarial bot generation'),

  // Cross-service auth
  INTERNAL_API_SECRET: z.string().min(16),

  // Email (optional in dev, recommended in prod)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  // Sandbox (optional)
  E2B_API_KEY: z.string().optional(),

  // Observability
  SENTRY_DSN: z.string().url().optional(),

  // Concurrency (optional, with defaults)
  WORKER_RUN_CONCURRENCY: z.coerce.number().int().positive().default(4),
  WORKER_EMAIL_CONCURRENCY: z.coerce.number().int().positive().default(16),
});

function format(error: z.ZodError): string {
  const lines = error.issues.map((i) => {
    const path = i.path.join('.') || '(root)';
    return `  - ${path}: ${i.message}`;
  });
  return ['Invalid worker environment:', ...lines, '', 'Check worker/.env'].join('\n');
}

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  // Surface a single, readable error instead of crashing later in init.
  // eslint-disable-next-line no-console
  console.error(format(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
