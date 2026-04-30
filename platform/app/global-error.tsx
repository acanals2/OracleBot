'use client';

/**
 * App-router global error boundary.
 *
 * Captures React render errors that bubble past per-route boundaries and
 * reports them to Sentry. Required for full coverage in App Router; without
 * it, render-time errors never reach the SDK.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ marginTop: '0.5rem', color: '#666' }}>
            We&apos;ve been notified. Please refresh and try again.
          </p>
        </div>
      </body>
    </html>
  );
}
