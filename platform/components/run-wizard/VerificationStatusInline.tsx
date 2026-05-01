'use client';

/**
 * Inline verification-status indicator for the run wizard. Renders below
 * the URL / endpoint input field. Debounces user input, calls
 * GET /api/verify-target?domain=..., and shows a small pill with the
 * resolved state plus a "Verify domain" link if unverified.
 *
 *   <VerificationStatusInline url={target.url ?? ''} />
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, Loader2, ShieldQuestion } from 'lucide-react';

type State = 'verified' | 'pending' | 'failed' | 'expired' | 'unverified' | 'carve_out';

interface ApiResponse {
  ok: true;
  data: {
    domain: string;
    state: State;
    isCarveOut: boolean;
  };
}

const DEBOUNCE_MS = 500;

export function VerificationStatusInline({ url }: { url: string }) {
  const trimmed = url.trim();
  const [state, setState] = useState<State | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trimmed) {
      setState(null);
      setDomain(null);
      setError(null);
      return;
    }
    if (!isProbablyUrl(trimmed)) {
      setState(null);
      setDomain(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ domain: trimmed });
        const res = await fetch(`/api/verify-target?${params}`, {
          headers: { accept: 'application/json' },
        });
        const json = (await res.json()) as ApiResponse | { ok: false; message?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !('ok' in json) || !json.ok) {
          setState(null);
          setError(
            'message' in json
              ? json.message ?? json.error ?? 'Lookup failed'
              : 'Lookup failed',
          );
        } else {
          setState(json.data.state);
          setDomain(json.data.domain);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Lookup failed');
        setState(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed]);

  if (!trimmed || !isProbablyUrl(trimmed)) return null;

  if (loading) {
    return (
      <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-ob-dim">
        <Loader2 className="h-3 w-3 animate-spin" />
        checking…
      </p>
    );
  }
  if (error) {
    return (
      <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-ob-warn">
        <AlertCircle className="h-3 w-3" />
        Couldn&apos;t check verification: {error}
      </p>
    );
  }
  if (!state) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px]">
      <StatePill state={state} />
      {domain && <span className="text-ob-dim">{domain}</span>}
      {state !== 'verified' && state !== 'carve_out' && (
        <Link
          href={`/app/settings/domains?prefill=${encodeURIComponent(domain ?? trimmed)}`}
          className="text-ob-signal underline-offset-2 hover:underline"
        >
          {state === 'unverified' ? 'Verify domain →' : 'Resolve →'}
        </Link>
      )}
    </div>
  );
}

function StatePill({ state }: { state: State }) {
  const map: Record<
    State,
    { label: string; cls: string; Icon: typeof CheckCircle2 }
  > = {
    verified: {
      label: 'verified',
      cls: 'border-ob-signal/40 bg-ob-signal/10 text-ob-signal',
      Icon: CheckCircle2,
    },
    carve_out: {
      label: 'auto-pass',
      cls: 'border-ob-signal/30 bg-ob-signal/5 text-ob-signal',
      Icon: CheckCircle2,
    },
    pending: {
      label: 'pending',
      cls: 'border-ob-warn/40 bg-ob-warn/10 text-ob-warn',
      Icon: ShieldQuestion,
    },
    failed: {
      label: 'failed',
      cls: 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger',
      Icon: AlertCircle,
    },
    expired: {
      label: 'expired',
      cls: 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger',
      Icon: AlertCircle,
    },
    unverified: {
      label: 'unverified',
      cls: 'border-ob-line bg-ob-bg/40 text-ob-muted',
      Icon: ShieldQuestion,
    },
  };
  const { label, cls, Icon } = map[state];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 uppercase tracking-widest ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function isProbablyUrl(s: string): boolean {
  // Crude heuristic: at least one dot and no whitespace.
  return /\S\.\S/.test(s) && !/\s/.test(s);
}
