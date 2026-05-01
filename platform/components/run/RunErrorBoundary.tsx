'use client';

/**
 * React error boundary for run-page widgets. Catches render errors in any
 * subtree (e.g. a recharts crash on malformed metric data) so a single bad
 * widget doesn't blank out the entire live page.
 *
 * Reports to Sentry on every catch so the failure shows up in our error
 * dashboard, not silently swallowed in production.
 *
 *   <RunErrorBoundary section="MetricsTimeline">
 *     <MetricsTimeline />
 *   </RunErrorBoundary>
 */
import * as Sentry from '@sentry/nextjs';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/Card';

interface Props {
  /** Logical name of the wrapped section (e.g. "chart", "event stream"). Surfaced in the fallback UI and Sentry tags. */
  section: string;
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class RunErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      tags: { boundary: this.props.section },
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <Card>
          <CardContent className="p-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-ob-danger">
              {this.props.section} failed to render
            </p>
            <p className="mt-2 text-sm text-ob-muted">
              The rest of the page is unaffected. We&apos;ve been notified — refresh to retry.
            </p>
            <p className="mt-3 font-mono text-xs text-ob-dim">
              {this.state.error.message}
            </p>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
