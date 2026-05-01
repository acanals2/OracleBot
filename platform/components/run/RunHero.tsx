'use client';

/**
 * Hero strip for the live-run console. Identity, status, target,
 * connection state, action cluster, and a progress bar with elapsed/ETA.
 *
 * Reads from useLiveRun() so status, run, and connection update in real
 * time as SSE messages arrive. The progress bar advances every 1s via a
 * local interval so it doesn't depend on metric arrivals.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Copy, Globe, Layers, MessageSquare, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useLiveRun } from './LiveRunProvider';
import { useToast } from '@/components/ui/Toast';
import { ActionCluster } from './ActionCluster';

const TERMINAL = new Set(['completed', 'failed', 'canceled', 'timed_out']);
const PROVISIONING = new Set(['queued', 'provisioning']);

const MODE_ICON = {
  site: Globe,
  agent: MessageSquare,
  api: Terminal,
  stack: Layers,
} as const;

interface Props {
  /** Hide write controls (cancel, share-live, kebab) for spectator mode. */
  readOnly?: boolean;
}

export function RunHero({ readOnly = false }: Props) {
  const { run, status, connection } = useLiveRun();
  const ModeIcon = MODE_ICON[run.mode];
  const toast = useToast();

  const targetUrl =
    run.targetLiveUrl ?? run.targetAgentEndpoint ?? run.targetRepoUrl ?? run.targetDockerImage;

  const isLive = !TERMINAL.has(status);
  const isProvisioning = PROVISIONING.has(status);

  const copyText = (text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.show(`${label} copied`))
      .catch(() => toast.show(`Failed to copy ${label}`, { kind: 'error' }));
  };

  return (
    <section className="space-y-4 rounded-xl border border-ob-line bg-ob-surface/80 p-5 shadow-card backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl tracking-tight text-ob-ink">{run.name}</h1>
            <button
              type="button"
              onClick={() => copyText(run.id, 'Run ID')}
              className="inline-flex items-center gap-1.5 rounded-md border border-ob-line bg-ob-bg/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-ob-muted transition-colors hover:text-ob-ink"
              aria-label="Copy run ID"
            >
              {run.id.slice(0, 8)}
              <Copy className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ModeBadge>
              <ModeIcon className="h-3 w-3" />
              {run.mode}
            </ModeBadge>
            <StatusPill status={status} />
            <ConnectionLed state={connection} live={isLive} />
            {targetUrl && (
              <button
                type="button"
                onClick={() => copyText(targetUrl, 'Target')}
                className="inline-flex max-w-md items-center gap-1.5 truncate rounded-md border border-ob-line bg-ob-bg/40 px-2 py-1 font-mono text-[11px] text-ob-muted transition-colors hover:text-ob-ink"
                aria-label="Copy target URL"
                title={targetUrl}
              >
                <span className="truncate">{targetUrl}</span>
                <Copy className="h-3 w-3 shrink-0" />
              </button>
            )}
          </div>
        </div>
        <ActionCluster readOnly={readOnly} />
      </div>

      <ProgressBar status={status} provisioning={isProvisioning} live={isLive} />
    </section>
  );
}

function ModeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-ob-signal/30 bg-ob-signal/5 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-ob-signal">
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const variant: 'signal' | 'warn' | 'default' | 'muted' =
    status === 'completed'
      ? 'signal'
      : status === 'running' || status === 'provisioning' || status === 'queued'
        ? 'warn'
        : status === 'failed' || status === 'canceled' || status === 'timed_out'
          ? 'muted'
          : 'default';
  const live = status === 'running' || status === 'provisioning' || status === 'queued';
  return (
    <Badge variant={variant} className="inline-flex items-center gap-1.5">
      {live && (
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {status}
    </Badge>
  );
}

function ConnectionLed({
  state,
  live,
}: {
  state: 'idle' | 'connecting' | 'open' | 'closed' | 'error';
  live: boolean;
}) {
  if (!live) return null;
  const map: Record<typeof state, { dot: string; label: string }> = {
    open: { dot: 'bg-ob-signal shadow-[0_0_8px_rgba(124,240,192,0.6)]', label: 'live' },
    connecting: { dot: 'bg-ob-warn', label: 'connecting' },
    error: { dot: 'bg-ob-danger', label: 'reconnecting' },
    closed: { dot: 'bg-ob-dim', label: 'closed' },
    idle: { dot: 'bg-ob-dim', label: 'idle' },
  };
  const { dot, label } = map[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-ob-line bg-ob-bg/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-ob-muted"
      aria-label={`Connection ${label}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

function ProgressBar({
  status,
  provisioning,
  live,
}: {
  status: string;
  provisioning: boolean;
  live: boolean;
}) {
  const { run } = useLiveRun();
  const totalMs = run.durationMinutes * 60_000;
  const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : null;
  const completedAt = run.completedAt ? new Date(run.completedAt).getTime() : null;

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!live || !startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [live, startedAt]);

  // Compute elapsed / progress on every render. For terminal runs, use
  // completedAt; for live runs, use the ticking `now`.
  const cap = completedAt ?? now;
  const elapsedMs = startedAt ? Math.max(0, cap - startedAt) : 0;
  const progress =
    totalMs > 0 ? Math.max(0, Math.min(1, elapsedMs / totalMs)) : status === 'completed' ? 1 : 0;

  const fillColor = provisioning
    ? 'bg-ob-warn'
    : status === 'completed'
      ? 'bg-ob-signal'
      : status === 'failed' || status === 'canceled' || status === 'timed_out'
        ? 'bg-ob-danger'
        : 'bg-ob-signal';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-ob-dim">
        <span>
          {provisioning
            ? 'provisioning'
            : startedAt
              ? `elapsed ${formatDuration(elapsedMs)}`
              : 'not started'}
        </span>
        <span>
          total {run.durationMinutes}m
          {live && startedAt ? ` · ETA ${formatTime(startedAt + totalMs)}` : ''}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ob-line/40" aria-hidden>
        {provisioning ? (
          <div className="h-full w-1/3 animate-[ob-rise_1200ms_ease-in-out_infinite_alternate] rounded-full bg-ob-warn/80" />
        ) : (
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${fillColor}`}
            style={{ width: `${(progress * 100).toFixed(2)}%` }}
          />
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
