'use client';

/**
 * Subscribes to the SSE stream at /api/runs/[id]/stream and exposes the
 * live run state to children via a React context. Keeps cursors so reconnects
 * pick up where we left off without replaying messages.
 *
 * Usage:
 *   <LiveRunProvider runId={...} initial={{ run, metrics, events, findings }}>
 *     <MetricsTimeline />   // calls useLiveRun() internally
 *     <EventStream />
 *   </LiveRunProvider>
 *
 * The provider only opens a stream while the run is in a non-terminal status
 * (queued / provisioning / running). Once status flips to completed/failed/etc.,
 * the EventSource is closed and `isLive` reads false.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Run, RunEvent, RunFinding, RunMetric } from '@/lib/db/schema';

type RunStatus = Run['status'];

const TERMINAL: ReadonlySet<RunStatus> = new Set([
  'completed',
  'failed',
  'canceled',
  'timed_out',
]);

export interface LiveRunState {
  run: Run;
  metrics: RunMetric[];
  events: RunEvent[];
  findings: RunFinding[];
  status: RunStatus;
  isLive: boolean;
  /** 'connecting' | 'open' | 'closed' | 'error' — diagnostic for indicator UI. */
  connection: ConnectionState;
}

type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

const LiveRunContext = createContext<LiveRunState | null>(null);

export function useLiveRun(): LiveRunState {
  const ctx = useContext(LiveRunContext);
  if (!ctx) {
    throw new Error('useLiveRun must be used inside <LiveRunProvider>');
  }
  return ctx;
}

interface ProviderProps {
  runId: string;
  initial: {
    run: Run;
    metrics: RunMetric[];
    events: RunEvent[];
    findings: RunFinding[];
  };
  children: ReactNode;
}

export function LiveRunProvider({ runId, initial, children }: ProviderProps) {
  const [run, setRun] = useState<Run>(initial.run);
  const [metrics, setMetrics] = useState<RunMetric[]>(initial.metrics);
  const [events, setEvents] = useState<RunEvent[]>(initial.events);
  const [findings, setFindings] = useState<RunFinding[]>(initial.findings);
  const [status, setStatus] = useState<RunStatus>(initial.run.status);
  const [connection, setConnection] = useState<ConnectionState>('idle');

  // Cursor refs — read across reconnects without retriggering the effect.
  const lastMetricIdRef = useRef<number>(maxId(initial.metrics));
  const lastEventIdRef = useRef<number>(maxId(initial.events));
  const lastFindingTimeRef = useRef<string>(maxCreatedAt(initial.findings));

  useEffect(() => {
    if (TERMINAL.has(status)) {
      setConnection('closed');
      return;
    }

    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      setConnection('connecting');
      const url = new URL(`/api/runs/${runId}/stream`, window.location.origin);
      url.searchParams.set('metricSince', String(lastMetricIdRef.current));
      url.searchParams.set('eventSince', String(lastEventIdRef.current));
      url.searchParams.set('findingSince', lastFindingTimeRef.current);

      es = new EventSource(url.toString(), { withCredentials: true });

      es.addEventListener('open', () => {
        if (!cancelled) setConnection('open');
      });

      es.addEventListener('metric', (ev) => {
        const m = JSON.parse((ev as MessageEvent).data) as RunMetric;
        if (m.id > lastMetricIdRef.current) lastMetricIdRef.current = m.id;
        setMetrics((prev) => [...prev, m]);
      });

      es.addEventListener('event', (ev) => {
        const e = JSON.parse((ev as MessageEvent).data) as RunEvent;
        if (e.id > lastEventIdRef.current) lastEventIdRef.current = e.id;
        // Newest first matches the page's existing display order.
        setEvents((prev) => [e, ...prev]);
      });

      es.addEventListener('finding', (ev) => {
        const f = JSON.parse((ev as MessageEvent).data) as RunFinding;
        const ts = new Date(f.createdAt).toISOString();
        if (ts > lastFindingTimeRef.current) lastFindingTimeRef.current = ts;
        setFindings((prev) => [...prev, f]);
      });

      es.addEventListener('status', (ev) => {
        const { status: next } = JSON.parse((ev as MessageEvent).data) as { status: RunStatus };
        setStatus(next);
        setRun((prev) => ({ ...prev, status: next }));
      });

      es.addEventListener('done', () => {
        // Server closed cleanly. Either the run is terminal (in which case
        // a 'status' message preceded this and the next render of this
        // component will see TERMINAL.has(status) and skip reconnect via the
        // effect's early-return), or the 9s self-timeout fired (we should
        // reconnect to keep streaming). We always schedule a reconnect; if
        // the run is terminal, the effect cleanup will cancel the timer
        // before it runs.
        es?.close();
        es = null;
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, 500);
      });

      es.addEventListener('error', () => {
        // EventSource auto-reconnects on transport errors, but our cursor
        // wouldn't be passed. Force-close and reconnect ourselves with the
        // updated cursor.
        if (cancelled) return;
        setConnection('error');
        es?.close();
        es = null;
        reconnectTimer = setTimeout(connect, 1500);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      setConnection('closed');
    };
    // We intentionally only re-establish on runId change. Status updates
    // are written via setStatus inside the handler; the cleanup-on-terminal
    // is enforced at the next render via the early-return at the top of the
    // effect (when TERMINAL.has(status) is true on a fresh render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, status]);

  const value = useMemo<LiveRunState>(
    () => ({
      run,
      metrics,
      events,
      findings,
      status,
      isLive: !TERMINAL.has(status),
      connection,
    }),
    [run, metrics, events, findings, status, connection],
  );

  return <LiveRunContext.Provider value={value}>{children}</LiveRunContext.Provider>;
}

// ── helpers ────────────────────────────────────────────────────────────────

function maxId<T extends { id: number | string }>(rows: T[]): number {
  let max = 0;
  for (const r of rows) {
    const n = typeof r.id === 'number' ? r.id : Number(r.id);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function maxCreatedAt(rows: { createdAt: Date | string }[]): string {
  let maxIso = new Date(0).toISOString();
  for (const r of rows) {
    const iso = typeof r.createdAt === 'string' ? r.createdAt : r.createdAt.toISOString();
    if (iso > maxIso) maxIso = iso;
  }
  return maxIso;
}
