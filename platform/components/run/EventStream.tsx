'use client';

/**
 * Live event stream component for the Run Console. Renders the run's
 * RunEvent timeline with:
 *   - Filter chips: lifecycle, progress, findings (toggle which event
 *     types are visible)
 *   - Auto-scroll-to-latest toggle (default ON; pinned to top of list
 *     since events are stored newest-first)
 *   - Per-event click-to-expand: shows ISO timestamp, relative time,
 *     metadata JSON (raw + friendly summary)
 *
 * Reads from useLiveRun() so new events appear as SSE delivers them.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ListFilter, Pause, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useLiveRun } from './LiveRunProvider';
import type { RunEvent } from '@/lib/db/schema';

const TERMINAL = new Set(['completed', 'failed', 'canceled', 'timed_out']);

type FilterKey = 'lifecycle' | 'progress' | 'findings';

const FILTERS: { key: FilterKey; label: string; types: ReadonlyArray<RunEvent['type']> }[] = [
  {
    key: 'lifecycle',
    label: 'Lifecycle',
    types: [
      'queued',
      'provisioning_started',
      'provisioning_completed',
      'run_started',
      'run_completed',
      'run_failed',
      'run_canceled',
      'run_timed_out',
    ],
  },
  { key: 'progress', label: 'Progress', types: ['progress'] },
  { key: 'findings', label: 'Findings', types: ['finding_surfaced'] },
];

const TYPE_TO_FILTER: Record<RunEvent['type'], FilterKey> = (() => {
  const m = {} as Record<RunEvent['type'], FilterKey>;
  for (const f of FILTERS) for (const t of f.types) m[t] = f.key;
  return m;
})();

export function EventStream() {
  const { events, status } = useLiveRun();
  const [active, setActive] = useState<Set<FilterKey>>(
    () => new Set(['lifecycle', 'progress', 'findings']),
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const visible = useMemo(
    () => events.filter((e) => active.has(TYPE_TO_FILTER[e.type] ?? 'lifecycle')),
    [events, active],
  );

  // Pin to top of list (newest first) when autoScroll is on and a new event
  // has arrived. Only scrolls when user is near the top to avoid yanking
  // them mid-read.
  useEffect(() => {
    if (!autoScroll) return;
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop > 60) return;
    el.scrollTop = 0;
  }, [visible.length, autoScroll]);

  const toggleFilter = (k: FilterKey) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Live event stream</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChips active={active} onToggle={toggleFilter} counts={countByFilter(events)} />
            <button
              type="button"
              onClick={() => setAutoScroll((v) => !v)}
              aria-pressed={autoScroll}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                autoScroll
                  ? 'border-ob-signal/40 bg-ob-signal/10 text-ob-signal'
                  : 'border-ob-line bg-ob-bg/40 text-ob-muted hover:text-ob-ink'
              }`}
              title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
            >
              {autoScroll ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {autoScroll ? 'auto' : 'pinned'}
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-ob-muted">{emptyEventCopy(status, active.size === 0)}</p>
        ) : (
          <ul
            ref={listRef}
            className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1 font-mono text-xs"
          >
            {visible.slice(0, 200).map((e) => (
              <EventRow
                key={e.id}
                event={e}
                expanded={expandedId === e.id}
                onToggle={() => setExpandedId((id) => (id === e.id ? null : e.id))}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FilterChips({
  active,
  onToggle,
  counts,
}: {
  active: ReadonlySet<FilterKey>;
  onToggle: (k: FilterKey) => void;
  counts: Record<FilterKey, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ListFilter className="h-3 w-3 text-ob-dim" aria-hidden />
      {FILTERS.map(({ key, label }) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
              isActive
                ? 'border-ob-signal/40 bg-ob-signal/10 text-ob-signal'
                : 'border-ob-line bg-ob-bg/40 text-ob-muted opacity-60 hover:opacity-100'
            }`}
          >
            <span>{label}</span>
            <span className="tabular-nums">{counts[key] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
}: {
  event: RunEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const hasMetadata = event.metadata && Object.keys(event.metadata).length > 0;
  const time = new Date(event.createdAt);

  return (
    <li className="rounded-md border border-ob-line/60 bg-ob-bg/20">
      <button
        type="button"
        onClick={hasMetadata ? onToggle : undefined}
        disabled={!hasMetadata}
        className="flex w-full items-start justify-between gap-2 px-2.5 py-1.5 text-left disabled:cursor-default"
        aria-expanded={hasMetadata ? expanded : undefined}
      >
        <div className="min-w-0 flex-1">
          <span className="mr-2 inline-block uppercase tracking-wider text-ob-signal">
            {event.type}
          </span>
          <span className="text-ob-ink">{event.message ?? ''}</span>
        </div>
        <span className="shrink-0 text-ob-muted">{time.toLocaleTimeString()}</span>
        {hasMetadata && (
          <span className="ml-1 shrink-0 text-ob-dim">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        )}
      </button>
      {expanded && hasMetadata && (
        <div className="space-y-1.5 border-t border-ob-line/60 px-2.5 py-2 text-[11px]">
          <div className="flex items-center gap-2 text-ob-muted">
            <span className="font-mono uppercase tracking-wider text-ob-dim">timestamp</span>
            <span>{time.toISOString()}</span>
            <span className="text-ob-dim">·</span>
            <span>{relativeTime(time)}</span>
          </div>
          <MetadataView metadata={event.metadata as Record<string, unknown>} />
        </div>
      )}
    </li>
  );
}

function MetadataView({ metadata }: { metadata: Record<string, unknown> }) {
  const [showRaw, setShowRaw] = useState(false);
  const summaryEntries = friendlySummary(metadata);
  return (
    <div>
      {summaryEntries.length > 0 && !showRaw && (
        <ul className="space-y-0.5">
          {summaryEntries.map(([k, v]) => (
            <li key={k} className="flex gap-2 text-ob-muted">
              <span className="font-mono uppercase tracking-wider text-ob-dim">{k}</span>
              <span className="break-all text-ob-ink">{String(v)}</span>
            </li>
          ))}
        </ul>
      )}
      {showRaw && (
        <pre className="overflow-x-auto rounded bg-ob-bg/60 p-2 font-mono text-[10px] text-ob-muted">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-ob-dim hover:text-ob-ink"
      >
        {showRaw ? '↑ summary' : '↓ raw'}
      </button>
    </div>
  );
}

function friendlySummary(metadata: Record<string, unknown>): Array<[string, unknown]> {
  // Flatten one level; skip null/undefined; show object/array as JSON snippets.
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(metadata)) {
    if (v == null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out.push([k, v]);
    } else {
      out.push([k, JSON.stringify(v)]);
    }
  }
  return out;
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function countByFilter(events: ReadonlyArray<RunEvent>): Record<FilterKey, number> {
  const c: Record<FilterKey, number> = { lifecycle: 0, progress: 0, findings: 0 };
  for (const e of events) {
    const k = TYPE_TO_FILTER[e.type] ?? 'lifecycle';
    c[k] += 1;
  }
  return c;
}

function emptyEventCopy(status: string, allFiltersOff: boolean): string {
  if (allFiltersOff) return 'All filters disabled. Click a chip above to show events.';
  if (TERMINAL.has(status)) {
    if (status === 'failed') return 'Run failed before any events were recorded.';
    if (status === 'canceled') return 'Run was canceled before any events were recorded.';
    return 'No events recorded for this run.';
  }
  switch (status) {
    case 'queued':
      return 'Run is queued. Waiting for the worker to pick it up.';
    case 'provisioning':
      return 'Provisioning sandbox. Bot execution starts as soon as this completes.';
    case 'running':
      return 'Bots running. Waiting for the first lifecycle or finding event…';
    default:
      return 'Waiting for events…';
  }
}
