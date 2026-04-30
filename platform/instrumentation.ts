/**
 * Next.js instrumentation hook — runs once per server process before any
 * route handlers. Used by Sentry to initialize the SDK in the right runtime.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/config/next-config-js/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
