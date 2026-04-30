/**
 * Sentry config for the Next.js server runtime (route handlers, RSC, server actions).
 * Loaded by `instrumentation.ts` only when running on Node.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Lower in prod once we have signal; high in dev for debugging.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
