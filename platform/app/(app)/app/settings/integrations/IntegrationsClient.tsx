'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Plus, Power, Sparkles, Trash2, Webhook } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ToastProvider, useToast } from '@/components/ui/Toast';

const PLATFORMS = [
  { id: 'lovable', label: 'Lovable' },
  { id: 'v0', label: 'v0 by Vercel' },
  { id: 'bolt', label: 'Bolt' },
  { id: 'replit_agent', label: 'Replit Agent' },
  { id: 'generic', label: 'Generic (custom)' },
] as const;

const PACK_OPTIONS = [
  { id: 'web_classics', label: 'Web Classics' },
  { id: 'ai_built_apps', label: 'AI-Built Apps' },
  { id: 'llm_endpoints', label: 'LLM Endpoints' },
] as const;

interface SubscriptionRow {
  id: string;
  platform: string;
  externalProjectId: string;
  label: string;
  packs: string[];
  productKey: string;
  minScore: number | null;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

interface CreateResp { secret: string; meta: SubscriptionRow }

export function IntegrationsClient({ initial }: { initial: SubscriptionRow[] }) {
  return (
    <ToastProvider>
      <Body initial={initial} />
    </ToastProvider>
  );
}

function Body({ initial }: { initial: SubscriptionRow[] }) {
  const [rows, setRows] = useState<SubscriptionRow[]>(initial);
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]['id']>('lovable');
  const [projectId, setProjectId] = useState('');
  const [label, setLabel] = useState('');
  const [packs, setPacks] = useState<string[]>(['web_classics', 'ai_built_apps']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ secret: string; meta: SubscriptionRow } | null>(null);
  const toast = useToast();

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://oraclebot.net';

  async function handleCreate() {
    if (!projectId.trim() || !label.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/webhook-subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform,
          externalProjectId: projectId.trim(),
          label: label.trim(),
          packs,
          productKey: 'free',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.message ?? json?.error ?? 'Failed');
      const data = json.data as CreateResp;
      setRows((prev) => [data.meta, ...prev]);
      setReveal({ secret: data.secret, meta: data.meta });
      setProjectId('');
      setLabel('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const res = await fetch(`/api/webhook-subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.message ?? 'Toggle failed');
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
      toast.show(enabled ? 'Enabled' : 'Paused');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Toggle failed', { kind: 'error' });
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete the "${label}" integration? Future webhooks from this project will be ignored.`)) return;
    try {
      const res = await fetch(`/api/webhook-subscriptions/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.message ?? 'Delete failed');
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.show(`Deleted "${label}"`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Delete failed', { kind: 'error' });
    }
  }

  async function handleCopy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`${what} copied`);
    } catch {
      toast.show(`Failed to copy ${what}`, { kind: 'error' });
    }
  }

  return (
    <>
      {/* Intro */}
      <Card>
        <CardHeader>
          <CardTitle>Codegen deploy webhooks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ob-muted">
          <p>
            Connect your Lovable, v0, Bolt, or Replit Agent project to auto-trigger an OracleBot
            scan on every deploy. We give you a webhook URL + signing secret; you paste them into
            the platform&apos;s webhook config.
          </p>
          <p>
            Each subscription scans the URL the platform sends in the deploy event. Make sure the
            target domain is verified under{' '}
            <a className="text-ob-signal hover:underline" href="/app/settings/domains">
              Settings → Domains
            </a>{' '}
            (deploy-preview hosts on <code className="rounded bg-ob-bg/40 px-1 font-mono text-xs">
              .vercel.app
            </code>{' '}
            etc. auto-pass).
          </p>
        </CardContent>
      </Card>

      {/* Create */}
      <Card>
        <CardHeader>
          <CardTitle>Add an integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="platform">Platform</Label>
              <select
                id="platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as typeof platform)}
                disabled={busy}
                className="flex h-10 w-full rounded-md border border-ob-line bg-ob-bg/40 px-3 font-mono text-sm text-ob-ink"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. main-site preview deploys"
                maxLength={120}
                disabled={busy}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="project-id">External project id</Label>
              <Input
                id="project-id"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="The id the platform sends in its webhook payload"
                maxLength={200}
                disabled={busy}
              />
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                Lovable: project UUID. v0: project slug. Bolt: project_id. Find it in the platform&apos;s
                project settings.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label>Probe packs</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PACK_OPTIONS.map((p) => {
                  const checked = packs.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setPacks((prev) =>
                          checked ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                        )
                      }
                      disabled={busy}
                      className={`rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors ${
                        checked
                          ? 'border-ob-signal/50 bg-ob-signal/10 text-ob-signal'
                          : 'border-ob-line bg-ob-bg/40 text-ob-muted hover:border-ob-signal/30'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={busy || !projectId.trim() || !label.trim() || packs.length === 0}>
              <Plus className="mr-1 h-4 w-4" />
              {busy ? 'Creating…' : 'Create integration'}
            </Button>
          </div>
          {error && (
            <p className="rounded-md border border-ob-danger/40 bg-ob-danger/10 p-3 font-mono text-xs text-ob-danger">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>Active integrations ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-ob-muted">
              No integrations yet. Add one above to start auto-scanning your codegen deploys.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ob-line bg-ob-surface/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <Webhook className="h-4 w-4 shrink-0 text-ob-muted" />
                      <span className="truncate font-display text-sm text-ob-ink">{s.label}</span>
                      <span className="rounded border border-ob-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ob-dim">
                        {PLATFORMS.find((p) => p.id === s.platform)?.label ?? s.platform}
                      </span>
                      {!s.enabled && (
                        <span className="rounded border border-ob-warn/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ob-warn">
                          paused
                        </span>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ob-dim">
                      <span>project: {s.externalProjectId}</span>
                      <span>· packs: {s.packs.join(', ')}</span>
                      <span>· created {fmtDate(s.createdAt)}</span>
                      {s.lastTriggeredAt && <span>· last fired {fmtDate(s.lastTriggeredAt)}</span>}
                      {!s.lastTriggeredAt && <span>· never fired</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(s.id, !s.enabled)}
                      aria-label={s.enabled ? `Pause ${s.label}` : `Enable ${s.label}`}
                    >
                      <Power className="mr-1 h-3.5 w-3.5" />
                      {s.enabled ? 'Pause' : 'Resume'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(s.id, s.label)}
                      aria-label={`Delete ${s.label}`}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent deliveries panel */}
      <DeliveriesPanel />

      {/* Reveal-once secret modal */}
      {reveal && (
        <RevealOnce
          appUrl={appUrl}
          secret={reveal.secret}
          meta={reveal.meta}
          onClose={() => setReveal(null)}
          onCopy={handleCopy}
        />
      )}
    </>
  );
}

function RevealOnce({
  appUrl,
  secret,
  meta,
  onClose,
  onCopy,
}: {
  appUrl: string;
  secret: string;
  meta: SubscriptionRow;
  onClose: () => void;
  onCopy: (text: string, what: string) => void;
}) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const webhookUrl = `${appUrl}/api/integrations/${meta.platform}/deploy`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-ob-line bg-ob-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ob-warn">
              Copy now — you won&apos;t see this again
            </p>
            <h2 className="mt-2 font-display text-xl text-ob-ink">
              Integration created · {meta.label}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-md border border-ob-line p-1 text-ob-muted hover:text-ob-ink"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-ob-warn/30 bg-ob-warn/5 p-4">
            <p className="text-sm text-ob-ink">
              Paste these two values into the {meta.platform} project&apos;s webhook configuration.
              The signing secret is only shown once — if you lose it, delete this integration and
              create a new one.
            </p>
          </div>

          <SnippetBlock
            label="Webhook URL"
            value={webhookUrl}
            copied={copiedUrl}
            onCopy={() => {
              onCopy(webhookUrl, 'Webhook URL');
              setCopiedUrl(true);
              setTimeout(() => setCopiedUrl(false), 1500);
            }}
          />
          <SnippetBlock
            label="Signing secret"
            value={secret}
            copied={copiedSecret}
            onCopy={() => {
              onCopy(secret, 'Signing secret');
              setCopiedSecret(true);
              setTimeout(() => setCopiedSecret(false), 1500);
            }}
          />

          <div className="rounded-lg border border-ob-line bg-ob-bg/40 p-3">
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ob-dim">
              <Sparkles className="h-3.5 w-3.5" />
              How signature verification works
            </p>
            <p className="mt-2 text-xs text-ob-muted">
              The platform should send the secret as <code className="rounded bg-ob-bg/60 px-1 font-mono">
                HMAC-SHA256(rawBody, secret)
              </code>{' '}
              in the platform-specific signature header (Lovable: <code className="rounded bg-ob-bg/60 px-1 font-mono">x-lovable-signature</code>; v0: <code className="rounded bg-ob-bg/60 px-1 font-mono">x-v0-signature</code>; etc.). OracleBot rejects requests with mismatched signatures.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function SnippetBlock({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-ob-line bg-ob-bg/40">
      <div className="flex items-center justify-between border-b border-ob-line/50 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            copied ? 'border-ob-signal/60 text-ob-signal' : 'border-ob-line text-ob-muted hover:text-ob-ink'
          }`}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-xs text-ob-ink">{value}</pre>
    </div>
  );
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    const ms = Date.now() - d.getTime();
    const day = 86400_000;
    if (ms < day) return 'today';
    if (ms < 2 * day) return 'yesterday';
    if (ms < 30 * day) return `${Math.floor(ms / day)}d ago`;
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

interface DeliveryRow {
  eventId: string;
  platform: string;
  deliveryId: string;
  type: string;
  receivedAt: string | null;
  processedAt: string | null;
  error: string | null;
  runId: string;
  runStatus: string;
  runScore: number | null;
  runTarget: string | null;
  runStartedAt: string | null;
}

function DeliveriesPanel() {
  const [rows, setRows] = useState<DeliveryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/webhook-deliveries');
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.message ?? 'Failed to load');
        if (!cancelled) setRows(json.data.deliveries as DeliveryRow[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent deliveries</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="rounded-md border border-ob-danger/40 bg-ob-danger/10 p-3 font-mono text-xs text-ob-danger">
            {error}
          </p>
        )}
        {!error && rows === null && (
          <p className="text-sm text-ob-muted">Loading…</p>
        )}
        {rows && rows.length === 0 && (
          <p className="text-sm text-ob-muted">
            No webhook deliveries yet. Once a configured platform sends a deploy event,
            the run it triggered shows up here.
          </p>
        )}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-ob-line/40">
            {rows.map((d) => (
              <li
                key={d.eventId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                    <span className="rounded border border-ob-line bg-ob-bg/40 px-1.5 py-0.5 text-ob-muted">
                      {d.platform}
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.5 ${runStatusStyle(d.runStatus)}`}
                    >
                      {d.runStatus}
                    </span>
                    {d.runScore != null && (
                      <span
                        className={`rounded border px-1.5 py-0.5 ${scoreStyle(d.runScore)}`}
                        title="Readiness score"
                      >
                        {d.runScore}/100
                      </span>
                    )}
                    <span className="text-ob-dim">
                      {d.receivedAt ? fmtDate(d.receivedAt) : 'queued'}
                    </span>
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-ob-muted">
                    target: {d.runTarget ?? '—'}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-ob-dim">
                    delivery {d.deliveryId} · run {d.runId.slice(0, 8)}
                  </p>
                  {d.error && (
                    <p className="mt-1 truncate font-mono text-[11px] text-ob-danger">
                      error: {d.error.slice(0, 200)}
                    </p>
                  )}
                </div>
                <Link
                  href={`/app/tests/${d.runId}/results`}
                  className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-ob-signal hover:underline"
                >
                  Open run <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function runStatusStyle(s: string): string {
  if (s === 'completed') return 'border-ob-signal/40 bg-ob-signal/10 text-ob-signal';
  if (s === 'failed' || s === 'timed_out' || s === 'canceled')
    return 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger';
  if (s === 'running' || s === 'provisioning')
    return 'border-ob-warn/40 bg-ob-warn/10 text-ob-warn';
  return 'border-ob-line text-ob-muted';
}

function scoreStyle(score: number): string {
  if (score >= 90) return 'border-ob-signal/40 text-ob-signal';
  if (score >= 70) return 'border-ob-warn/40 text-ob-warn';
  return 'border-ob-danger/40 text-ob-danger';
}
