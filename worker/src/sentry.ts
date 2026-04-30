/**
 * Sentry init for the worker. Imported early in `index.ts` so unhandled
 * exceptions and rejections from any subsequently loaded module are captured.
 */
import * as Sentry from '@sentry/node';
import { env } from './env.js';

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}

export { Sentry };
