'use client';

/**
 * Interactive API-tokens settings UI. Mints, lists, reveals once, revokes.
 *
 * Security UX:
 *   - Raw token is shown ONLY in the modal that opens immediately after
 *     creation. Clicking outside / closing dismisses it permanently.
 *   - The list never re-displays the raw token — only the 12-char prefix.
 *   - Revoke is a confirm-then-act flow; no undo path on the server side.
 */
import { useState } from 'react';
import {
  Check, ChevronDown, Copy, KeyRound, Plus, Terminal, Trash2, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ToastProvider, useToast } from '@/components/ui/Toast';

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreateResponse {
  token: string;
  meta: TokenRow;
}

export function ApiTokensClient({ initial }: { initial: TokenRow[] }) {
  return (
    <ToastProvider>
      <ApiTokensBody initial={initial} />
    </ToastProvider>
  );
}

function ApiTokensBody({ initial }: { initial: TokenRow[] }) {
  const [rows, setRows] = useState<TokenRow[]>(initial);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ raw: string; meta: TokenRow } | null>(null);
  const toast = useToast();

  async function handleCreate() {
    if (!newName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? 'Failed to create token');
      }
      const data = json.data as CreateResponse;
      setRows((prev) => [data.meta, ...prev]);
      setReveal({ raw: data.token, meta: data.meta });
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? This cannot be undone — any CI / Action / CLI using this token will start failing immediately.`)) return;
    try {
      const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? 'Revoke failed');
      }
      setRows((prev) => prev.filter((t) => t.id !== id));
      toast.show(`Revoked "${name}"`);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Revoke failed', { kind: 'error' });
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
    <>
      {/* Intro / what these are for */}
      <Card>
        <CardHeader>
          <CardTitle>API tokens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ob-muted">
          <p>
            Tokens authenticate non-browser clients — the OracleBot{' '}
            <a
              className="text-ob-signal hover:underline"
              href="https://github.com/oraclebot/oraclebot-scan"
              target="_blank"
              rel="noreferrer"
            >
              GitHub Action
            </a>
            , the CLI, and any CI script that calls{' '}
            <code className="rounded bg-ob-bg/40 px-1 font-mono text-xs">/api/runs</code> or{' '}
            <code className="rounded bg-ob-bg/40 px-1 font-mono text-xs">/api/runs/&lt;id&gt;</code>.
          </p>
          <p>
            Each token inherits the creating user&apos;s role on this org. Send it as{' '}
            <code className="rounded bg-ob-bg/40 px-1 font-mono text-xs">Authorization: Bearer obt_…</code>.
            We never store the raw token — only a SHA-256 hash. The raw value is shown once at
            creation and never again.
          </p>
        </CardContent>
      </Card>

      {/* Create */}
      <Card>
        <CardHeader>
          <CardTitle>Create a token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. github-action-acme/widget"
                maxLength={120}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                }}
              />
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                Pick a name that says where the token will live so you can revoke the right one later.
              </p>
            </div>
            <div className="self-end">
              <Button onClick={handleCreate} disabled={busy || !newName.trim()}>
                <Plus className="mr-1 h-4 w-4" />
                {busy ? 'Creating…' : 'Create token'}
              </Button>
            </div>
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
          <CardTitle>Active tokens ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-ob-muted">
              No tokens yet. Create one above to authenticate the GitHub Action or CLI.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ob-line bg-ob-surface/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 shrink-0 text-ob-muted" />
                      <span className="truncate font-display text-sm text-ob-ink">{t.name}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ob-dim">
                      <span>{t.prefix}…</span>
                      <span>· created {fmtDate(t.createdAt)}</span>
                      {t.lastUsedAt && <span>· last used {fmtDate(t.lastUsedAt)}</span>}
                      {!t.lastUsedAt && <span>· never used</span>}
                      {t.expiresAt && <span>· expires {fmtDate(t.expiresAt)}</span>}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(t.id, t.name)}
                    aria-label={`Revoke ${t.name}`}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Reveal-once modal */}
      {reveal && (
        <RevealOnce
          raw={reveal.raw}
          name={reveal.meta.name}
          onClose={() => setReveal(null)}
          onCopy={(text, label) => handleCopy(text, label)}
        />
      )}
    </>
  );
}

function RevealOnce({
  raw,
  name,
  onClose,
  onCopy,
}: {
  raw: string;
  name: string;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    onCopy(raw, 'Token');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-title"
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
            <h2 id="reveal-title" className="mt-2 font-display text-xl text-ob-ink">
              Token created · {name}
            </h2>
          </div>
          <button
            type="button"
            className="rounded-md border border-ob-line p-1 text-ob-muted hover:text-ob-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-ob-warn/30 bg-ob-warn/5 p-4">
            <p className="text-sm text-ob-ink">
              Copy this token now and store it somewhere safe (a GitHub repo secret, a 1Password
              entry, etc.). OracleBot only stores a hash — we cannot show this value again, and
              we cannot recover it. If you lose it, revoke and mint a new one.
            </p>
          </div>

          <div className="rounded-lg border border-ob-line bg-ob-bg/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                Bearer token
              </span>
              <button
                type="button"
                onClick={copy}
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  copied
                    ? 'border-ob-signal/60 text-ob-signal'
                    : 'border-ob-line text-ob-muted hover:text-ob-ink'
                }`}
                aria-label="Copy token"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <pre className="overflow-x-auto font-mono text-xs text-ob-ink">{raw}</pre>
          </div>

          <details className="rounded-lg border border-ob-line bg-ob-bg/40">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-ob-muted hover:text-ob-ink">
              <Terminal className="h-3.5 w-3.5" />
              How to use it
              <ChevronDown className="ml-auto h-3.5 w-3.5" />
            </summary>
            <div className="space-y-3 px-3 pb-3 text-xs">
              <p className="text-ob-muted">In a GitHub Action workflow:</p>
              <pre className="overflow-x-auto rounded bg-ob-bg/60 p-2 font-mono text-[11px] text-ob-ink">{`- uses: oraclebot/oraclebot-scan@v1
  with:
    oraclebot-token: \${{ secrets.ORACLEBOT_TOKEN }}
    target-url: https://staging.your-app.com`}</pre>

              <p className="text-ob-muted">From a shell / CI script:</p>
              <pre className="overflow-x-auto rounded bg-ob-bg/60 p-2 font-mono text-[11px] text-ob-ink">{`curl -X POST https://oraclebot.net/api/runs \\
  -H "authorization: Bearer ${raw.slice(0, 12)}…" \\
  -H "content-type: application/json" \\
  -d '{ "mode": "site", "name": "ci-run", "productKey": "free", "botCount": 5,
        "durationMinutes": 3, "target": { "kind": "liveUrl", "url": "https://x.com" },
        "packs": ["web_classics","ai_built_apps"] }'`}</pre>
            </div>
          </details>
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
