'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AlertCircle, Check, Copy, Power, Trash2, Webhook } from 'lucide-react';

const EVENT_TYPES = ['run.completed', 'run.failed'] as const;
type EventType = (typeof EVENT_TYPES)[number];

interface OutboundWebhookRow {
  id: string;
  label: string;
  url: string;
  events: string[];
  enabled: boolean;
  lastDeliveredAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export function OutboundWebhooksClient({ initial }: { initial: OutboundWebhookRow[] }) {
  const [rows, setRows] = useState<OutboundWebhookRow[]>(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<EventType[]>(['run.completed', 'run.failed']);

  function reset() {
    setLabel('');
    setUrl('');
    setEvents(['run.completed', 'run.failed']);
    setCreateError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/outbound-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, url, events }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message ?? 'Could not create webhook');
      }
      const meta = json.data.meta;
      setRows((prev) => [
        {
          id: meta.id,
          label: meta.label,
          url: meta.url,
          events: meta.events,
          enabled: meta.enabled,
          lastDeliveredAt: null,
          lastError: null,
          createdAt: meta.createdAt,
        },
        ...prev,
      ]);
      setRevealedSecret({ id: meta.id, secret: json.data.secret });
      setShowCreate(false);
      reset();
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function onToggle(id: string, enabled: boolean) {
    const res = await fetch(`/api/outbound-webhooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this webhook? This cannot be undone.')) return;
    const res = await fetch(`/api/outbound-webhooks/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (revealedSecret?.id === id) setRevealedSecret(null);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Outbound webhooks</CardTitle>
            <p className="mt-1 text-sm text-ob-muted">
              We POST a JSON payload to each endpoint when a run completes or fails. Every
              request carries an <code className="font-mono text-xs">X-OracleBot-Signature</code>{' '}
              HMAC-SHA256 header you should verify before acting.
            </p>
          </div>
          {!showCreate && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Webhook className="mr-2 h-4 w-4" />
              Add webhook
            </Button>
          )}
        </CardHeader>
        {showCreate && (
          <CardContent className="border-t border-ob-line">
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                  Label
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Slack #ops · #incidents"
                  className="mt-1 w-full rounded-md border border-ob-line bg-ob-surface px-3 py-2 text-sm text-ob-ink"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                  Endpoint URL
                </label>
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T/..."
                  className="mt-1 w-full rounded-md border border-ob-line bg-ob-surface px-3 py-2 font-mono text-xs text-ob-ink"
                />
                <p className="mt-1 text-[11px] text-ob-dim">
                  HTTPS required in production. Localhost is allowed in dev.
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                  Events
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {EVENT_TYPES.map((evt) => {
                    const checked = events.includes(evt);
                    return (
                      <label
                        key={evt}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-xs ${
                          checked
                            ? 'border-ob-signal/40 bg-ob-signal/10 text-ob-signal'
                            : 'border-ob-line bg-ob-surface text-ob-muted hover:bg-ob-surface/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setEvents((prev) =>
                              checked ? prev.filter((e) => e !== evt) : [...prev, evt],
                            )
                          }
                          className="sr-only"
                        />
                        {evt}
                      </label>
                    );
                  })}
                </div>
              </div>
              {createError && (
                <p className="flex items-center gap-2 text-sm text-ob-danger">
                  <AlertCircle className="h-4 w-4" /> {createError}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creating…' : 'Create webhook'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowCreate(false);
                    reset();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      {revealedSecret && (
        <Card className="border-ob-signal/40 bg-ob-signal/5">
          <CardHeader>
            <CardTitle className="text-ob-signal">Save this secret now</CardTitle>
            <p className="mt-1 text-sm text-ob-muted">
              You won&apos;t see it again. Paste it into your endpoint&apos;s signature
              verifier — without it, you can&apos;t prove the webhook came from OracleBot.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 rounded-md border border-ob-signal/40 bg-ob-bg p-3">
              <code className="flex-1 truncate font-mono text-xs text-ob-ink">
                {revealedSecret.secret}
              </code>
              <Button size="sm" variant="ghost" onClick={() => copy(revealedSecret.secret)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setRevealedSecret(null)}
            >
              I&apos;ve saved it — dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Webhook className="mx-auto h-8 w-8 text-ob-dim" />
            <p className="mt-3 text-sm text-ob-muted">
              No outbound webhooks yet. Add one to get notified on run completions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ob-ink">{r.label}</p>
                    <Badge variant={r.enabled ? 'signal' : 'muted'}>
                      {r.enabled ? 'enabled' : 'paused'}
                    </Badge>
                    {r.events.map((e) => (
                      <span
                        key={e}
                        className="rounded-md border border-ob-line bg-ob-surface px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ob-muted"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-ob-muted">{r.url}</p>
                  {r.lastError ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-ob-danger">
                      <AlertCircle className="h-3 w-3" /> last error: {r.lastError}
                    </p>
                  ) : r.lastDeliveredAt ? (
                    <p className="mt-1 text-xs text-ob-dim">
                      last delivered{' '}
                      <span className="font-mono">
                        {new Date(r.lastDeliveredAt).toLocaleString()}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-ob-dim">no deliveries yet</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => onToggle(r.id, !r.enabled)}>
                    <Power className="mr-1 h-3 w-3" />
                    {r.enabled ? 'Pause' : 'Resume'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(r.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
