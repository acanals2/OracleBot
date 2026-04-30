/**
 * Sentry config for the browser. Reads NEXT_PUBLIC_SENTRY_DSN since the value
 * is exposed to the client at build time.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

// Required by Next.js App Router so client-side navigations are instrumented.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
