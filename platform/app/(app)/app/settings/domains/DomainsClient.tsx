'use client';

/**
 * Interactive domains UI. Adds new verifications, runs lookups, copies
 * challenge tokens. Lives under the authenticated /app/settings/domains
 * route.
 */
import { useState } from 'react';
import { CheckCircle2, Circle, Copy, Globe, RefreshCw, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import type { TargetVerification } from '@/lib/db/schema';

type Method = 'dns_txt' | 'well_known_file';

interface Instructions {
  method: Method;
  summary: string;
  details: string[];
}

interface VerifyTargetResponse {
  verification: TargetVerification;
  instructions?: Instructions;
}

export function DomainsClient({ initial }: { initial: TargetVerification[] }) {
  return (
    <ToastProvider>
      <DomainsBody initial={initial} />
    </ToastProvider>
  );
}

function DomainsBody({ initial }: { initial: TargetVerification[] }) {
  const [rows, setRows] = useState<TargetVerification[]>(initial);
  const [domain, setDomain] = useState('');
  const [method, setMethod] = useState<Method>('dns_txt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestInstructions, setLatestInstructions] = useState<Instructions | null>(null);
  const toast = useToast();

  async function handleCreate() {
    if (!domain.trim()) return;
    setBusy(true);
    setError(null);
    setLatestInstructions(null);
    try {
      const res = await fetch('/api/verify-target', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ domain: domain.trim(), method }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? 'Failed to create challenge');
      }
      const data = json.data as VerifyTargetResponse;
      setRows((prev) => upsert(prev, data.verification));
      setLatestInstructions(data.instructions ?? null);
      setDomain('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCheck(id: string) {
    try {
      const res = await fetch(`/api/verify-target/${id}`, {
        method: 'PATCH',
        headers: { accept: 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? 'Check failed');
      }
      const v = (json.data as { verification: TargetVerification }).verification;
      setRows((prev) => upsert(prev, v));
      if (v.status === 'verified') {
        toast.show(`${v.domain} verified`);
      } else {
        toast.show(v.lastError ?? 'Verification still pending', { kind: 'info', timeoutMs: 4500 });
      }
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Check failed', { kind: 'error' });
    }
  }

  async function handleCopy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${label} copied`);
    } catch {
      toast.show(`Failed to copy ${label}`, { kind: 'error' });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a domain</CardTitle>
          <p className="text-sm text-ob-muted">
            Run targets are gated on domain ownership. Pick a verification method, publish the
            challenge, then run the check. localhost, *.vercel.app, *.railway.app, and a few
            documentation domains skip verification automatically.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                placeholder="staging.yourproduct.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <Label htmlFor="method">Method</Label>
              <select
                id="method"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
                disabled={busy}
                className="h-10 rounded-lg border border-ob-line bg-ob-bg px-3 font-mono text-xs text-ob-ink focus:border-ob-signal/50 focus:outline-none focus:ring-2 focus:ring-ob-glow"
              >
                <option value="dns_txt">DNS TXT</option>
                <option value="well_known_file">.well-known file</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreate} disabled={busy || !domain.trim()}>
                {busy ? 'Creating…' : 'Create challenge'}
              </Button>
            </div>
          </div>
          {error && (
            <p className="rounded-md border border-ob-danger/40 bg-ob-danger/10 px-3 py-2 text-sm text-ob-danger">
              {error}
            </p>
          )}
          {latestInstructions && <InstructionsPanel instructions={latestInstructions} onCopy={handleCopy} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verifications ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-ob-muted">
              No verifications yet. Add a domain above to get started.
            </p>
          ) : (
            <ul className="space-y-3">
              {rows.map((v) => (
                <VerificationRow key={v.id} v={v} onCheck={handleCheck} onCopy={handleCopy} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function VerificationRow({
  v,
  onCheck,
  onCopy,
}: {
  v: TargetVerification;
  onCheck: (id: string) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const challengeValue =
    v.method === 'dns_txt' ? `oracle-bot-verify=${v.challengeToken}` : v.challengeToken;
  const challengeLabel = v.method === 'dns_txt' ? 'TXT value' : 'File body';

  return (
    <li className="rounded-xl border border-ob-line bg-ob-surface/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-ob-signal" />
            <p className="font-mono text-sm text-ob-ink">{v.domain}</p>
            <StatusPill status={v.status} expired={v.expiresAt < new Date()} />
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ob-dim">
            {v.method === 'dns_txt' ? 'DNS TXT' : '.well-known file'}
            {' · '}
            expires {new Date(v.expiresAt).toLocaleDateString()}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => onCheck(v.id)}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Run check
        </Button>
      </div>

      {v.status !== 'verified' && (
        <div className="mt-3 space-y-2 rounded-lg border border-ob-line bg-ob-bg/40 p-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-ob-dim">
            {challengeLabel}
          </p>
          <button
            type="button"
            onClick={() => onCopy(challengeValue, challengeLabel)}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-ob-line bg-ob-surface px-2.5 py-1.5 text-left font-mono text-xs text-ob-ink transition-colors hover:text-ob-signal"
            aria-label={`Copy ${challengeLabel}`}
          >
            <span className="truncate">{challengeValue}</span>
            <Copy className="h-3.5 w-3.5 shrink-0" />
          </button>
          {v.method === 'well_known_file' && (
            <p className="font-mono text-[10px] text-ob-muted">
              Serve at <span className="text-ob-ink">https://{v.domain}/.well-known/oraclebot.txt</span>
            </p>
          )}
        </div>
      )}

      {v.lastError && v.status !== 'verified' && (
        <p className="mt-3 rounded-md border border-ob-danger/30 bg-ob-danger/5 px-3 py-2 font-mono text-xs text-ob-danger">
          {v.lastError}
        </p>
      )}
    </li>
  );
}

function InstructionsPanel({
  instructions,
  onCopy,
}: {
  instructions: Instructions;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="rounded-lg border border-ob-signal/30 bg-ob-signal/5 p-4">
      <div className="flex items-center gap-2 text-ob-signal">
        <ShieldCheck className="h-4 w-4" />
        <p className="font-mono text-xs uppercase tracking-widest">Instructions</p>
      </div>
      <p className="mt-2 text-sm text-ob-ink">{instructions.summary}</p>
      <ul className="mt-2 space-y-1 font-mono text-xs text-ob-muted">
        {instructions.details.map((line, i) => {
          // If a line is just a `Value: <token>` or similar, make it copyable.
          const m = /^([^:]+):\s+(.+)$/.exec(line);
          if (m && (m[1] === 'Value' || m[1] === 'Body')) {
            return (
              <li key={i} className="flex items-start gap-2">
                <span className="shrink-0 text-ob-dim">{m[1]}:</span>
                <button
                  type="button"
                  onClick={() => onCopy(m[2], m[1])}
                  className="inline-flex max-w-full items-center gap-1 truncate text-left text-ob-ink transition-colors hover:text-ob-signal"
                >
                  <span className="truncate">{m[2]}</span>
                  <Copy className="h-3 w-3 shrink-0" />
                </button>
              </li>
            );
          }
          return (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-ob-dim">·</span>
              <span>{line}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatusPill({ status, expired }: { status: string; expired: boolean }) {
  const verified = status === 'verified' && !expired;
  const Icon = verified ? CheckCircle2 : Circle;
  const cls = verified
    ? 'border-ob-signal/40 bg-ob-signal/10 text-ob-signal'
    : status === 'failed' || expired
      ? 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger'
      : 'border-ob-warn/40 bg-ob-warn/10 text-ob-warn';
  const label = expired ? 'expired' : status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function upsert(rows: TargetVerification[], v: TargetVerification): TargetVerification[] {
  const idx = rows.findIndex((r) => r.id === v.id);
  if (idx === -1) return [v, ...rows];
  const next = rows.slice();
  next[idx] = v;
  return next;
}
