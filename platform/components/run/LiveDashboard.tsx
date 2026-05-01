'use client';

/**
 * Run Console — the live-run dashboard layout.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ RunHero (identity, status, target, action cluster, progress) │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ KpiStrip (6 KPI cards w/ sparklines)                         │
 *   ├──────────────────────────────────────┬───────────────────────┤
 *   │ MetricsTimeline (chart)              │ LiveFindingsPanel     │
 *   │                                      │                       │
 *   │ EventStream (filterable + expand)    │ RunConfigCard         │
 *   └──────────────────────────────────────┴───────────────────────┘
 *
 * Each panel is wrapped in RunErrorBoundary so a single widget crash
 * doesn't blank the page. ToastProvider wraps everything so any nested
 * component can call useToast().
 */
import { ToastProvider } from '@/components/ui/Toast';
import { RunHero } from './RunHero';
import { KpiStrip } from './KpiStrip';
import { MetricsTimeline } from './MetricsTimeline';
import { LiveFindingsPanel } from './LiveFindingsPanel';
import { EventStream } from './EventStream';
import { RunConfigCard } from './RunConfigCard';
import { RunErrorBoundary } from './RunErrorBoundary';

interface Props {
  /** Hide write controls for spectator (share-link) views. */
  readOnly?: boolean;
}

export function LiveDashboard({ readOnly = false }: Props) {
  return (
    <ToastProvider>
      <div className="space-y-6">
        <RunErrorBoundary section="hero">
          <RunHero readOnly={readOnly} />
        </RunErrorBoundary>

        <RunErrorBoundary section="kpi-strip">
          <KpiStrip />
        </RunErrorBoundary>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <RunErrorBoundary section="metrics-timeline">
              <MetricsTimeline />
            </RunErrorBoundary>
            <RunErrorBoundary section="event-stream">
              <EventStream />
            </RunErrorBoundary>
          </div>
          <aside className="space-y-6">
            <RunErrorBoundary section="findings-panel">
              <LiveFindingsPanel />
            </RunErrorBoundary>
            <RunErrorBoundary section="config-card">
              <RunConfigCard />
            </RunErrorBoundary>
          </aside>
        </div>
      </div>
    </ToastProvider>
  );
}
