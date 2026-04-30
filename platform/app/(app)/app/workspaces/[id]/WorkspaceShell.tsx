'use client';

/**
 * Minimal three-region workspace UI:
 *
 *   ┌──────────────────────┬──────────────────────────────────────────┐
 *   │  File list (read     │  Preview iframe                           │
 *   │  only for now)       │   ─────────────────────────────────────   │
 *   │                      │  Launch / Stop / Hard-rebuild buttons    │
 *   │                      │  Phase indicator + log tail              │
 *   │                      │  CompileErrorOverlay (when error)        │
 *   └──────────────────────┴──────────────────────────────────────────┘
 *
 * Polished editor + checkpoint UI come later. This is the smallest UI
 * that demonstrates "launch a preview" end-to-end.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CompileErrorOverlay } from '@/components/oracle-preview/CompileErrorOverlay';
import { File, FlaskConical, FolderTree, Play, Square, RefreshCw, Terminal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { PreviewState } from '@/lib/oracle-preview-types';

interface WorkspaceFileEntry {
  path: string;
  bytes: number;
  modifiedAt: string;
}

interface Props {
  workspaceId: string;
  initialFiles: WorkspaceFileEntry[];
}

const POLL_INTERVAL_MS = 2000;

export function WorkspaceShell({ workspaceId, initialFiles }: Props) {
  const router = useRouter();
  const [files, setFiles] = useState<WorkspaceFileEntry[]>(initialFiles);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testingBusy, setTestingBusy] = useState(false);
  const iframeKey = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Initial fetch of preview state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/oracle/preview/${workspaceId}`);
        const json = (await res.json()) as PreviewState;
        if (!cancelled) setPreview(json);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Poll preview state while it's transitioning (not stable live/stopped).
  useEffect(() => {
    if (!preview) return;
    const transient =
      preview.phase === 'compiling' ||
      preview.phase === 'first-paint' ||
      preview.phase === 'installing';
    if (!transient) return;

    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/oracle/preview/${workspaceId}`);
        const json = (await res.json()) as PreviewState;
        setPreview(json);
      } catch {
        /* keep polling */
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [workspaceId, preview]);

  // SSE for live file-change events. Reconnect when phase first turns live.
  useEffect(() => {
    if (!preview || (preview.phase !== 'live' && preview.phase !== 'first-paint')) return;
    const es = new EventSource(`/api/oracle/preview/${workspaceId}/changes`);
    eventSourceRef.current = es;
    es.addEventListener('change', () => {
      // Bump the iframe key to force a clean reload.
      iframeKey.current += 1;
      setPreview((prev) => (prev ? { ...prev } : prev));
    });
    es.addEventListener('rebuild', () => {
      iframeKey.current += 1;
      setPreview((prev) => (prev ? { ...prev } : prev));
    });
    es.addEventListener('state', async () => {
      try {
        const res = await fetch(`/api/oracle/preview/${workspaceId}`);
        const json = (await res.json()) as PreviewState;
        setPreview(json);
      } catch {
        /* ignore */
      }
    });
    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [workspaceId, preview?.phase]);

  const launch = useCallback(
    async (hardRebuild = false) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/oracle/preview/${workspaceId}${hardRebuild ? '?hardRebuild=1' : ''}`,
          { method: 'POST' },
        );
        const json = (await res.json()) as PreviewState | { error?: string };
        if ('error' in json && json.error) {
          throw new Error(json.error);
        }
        setPreview(json as PreviewState);
        // Refresh file list — install may have created package-lock.json etc.
        const filesRes = await fetch(`/api/oracle/workspace/${workspaceId}/files`);
        if (filesRes.ok) {
          const fjson = await filesRes.json();
          if (Array.isArray(fjson.files)) setFiles(fjson.files);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [workspaceId],
  );

  const stop = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch(`/api/oracle/preview/${workspaceId}`, { method: 'DELETE' });
      const res = await fetch(`/api/oracle/preview/${workspaceId}`);
      const json = (await res.json()) as PreviewState;
      setPreview(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [workspaceId]);

  const launchTest = useCallback(async () => {
    if (!preview?.url) return;
    setTestingBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'site',
          name: `Workspace test · ${new Date().toISOString().slice(0, 10)}`,
          productKey: 'scout',
          botCount: 100,
          durationMinutes: 1,
          target: { kind: 'liveUrl', url: preview.url },
          hardCapCents: 500,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.message ?? 'Failed to create run.');
      router.push(`/app/tests/${json.data.runId}/live`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTestingBusy(false);
    }
  }, [preview?.url, router]);

  const phase = preview?.phase ?? 'idle';
  const showIframe = phase === 'first-paint' || phase === 'live';
  const iframeUrl = useMemo(() => {
    if (!preview?.url) return null;
    // Cache-bust on rebuild so the iframe doesn't render stale HTML.
    return `${preview.url}?_k=${iframeKey.current}`;
  }, [preview?.url, preview?.phase]);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* File rail */}
      <Card className="self-start">
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FolderTree className="h-4 w-4 text-ob-signal" />
            Files
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="max-h-[500px] overflow-y-auto py-2 font-mono text-[11.5px]">
            {files.length === 0 ? (
              <li className="px-4 py-2 text-ob-dim">No files yet.</li>
            ) : (
              files.map((f) => (
                <li
                  key={f.path}
                  className="flex items-center gap-2 px-4 py-1 text-ob-muted hover:bg-ob-bg/40"
                  title={`${f.bytes} bytes · ${new Date(f.modifiedAt).toLocaleString()}`}
                >
                  <File className="h-3 w-3 flex-none opacity-60" />
                  <span className="truncate">{f.path}</span>
                </li>
              ))
            )}
          </ul>
          <div className="border-t border-ob-line px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-ob-dim">
            {files.length} file{files.length === 1 ? '' : 's'}
          </div>
        </CardContent>
      </Card>

      {/* Preview pane */}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <PhaseBadge phase={phase} />
            <p className="font-mono text-[11px] text-ob-dim">
              {preview?.port ? `localhost:${preview.port}` : '—'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => launch(false)}
              disabled={busy || phase === 'compiling' || phase === 'installing' || phase === 'live' || phase === 'first-paint'}
            >
              <Play className="mr-1 h-3 w-3" />
              Launch
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => launch(true)}
              disabled={busy || phase === 'idle' || phase === 'stopped'}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Hard rebuild
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={stop}
              disabled={busy || phase === 'idle' || phase === 'stopped'}
            >
              <Square className="mr-1 h-3 w-3" />
              Stop
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowLog((v) => !v)}
            >
              <Terminal className="mr-1 h-3 w-3" />
              {showLog ? 'Hide log' : 'Log'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={launchTest}
              disabled={testingBusy || phase !== 'live'}
              title={phase !== 'live' ? 'Launch the preview first' : 'Run Oracle Bot against this preview'}
            >
              <FlaskConical className="mr-1 h-3 w-3" />
              {testingBusy ? 'Starting…' : 'Test'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          {error && (
            <div className="mx-4 my-3 rounded-lg border border-ob-danger/40 bg-ob-danger/10 p-3 text-xs text-ob-danger">
              {error}
            </div>
          )}

          <div className="relative aspect-[16/10] w-full bg-ob-bg">
            {showIframe && iframeUrl ? (
              <iframe
                key={iframeKey.current}
                src={iframeUrl}
                title="Workspace preview"
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div className="max-w-md space-y-2 px-6">
                  <p className="font-display text-lg text-ob-ink">
                    {phase === 'idle' && 'Preview not running'}
                    {phase === 'installing' && 'Installing dependencies…'}
                    {phase === 'compiling' && 'Compiling workspace…'}
                    {phase === 'stopped' && 'Preview stopped'}
                    {phase === 'error' && 'Preview failed'}
                  </p>
                  <p className="text-xs text-ob-muted">
                    {phase === 'idle' || phase === 'stopped'
                      ? "Click 'Launch' to spawn a sandboxed `next dev` process for this workspace."
                      : phase === 'installing'
                        ? 'First run takes a minute — npm is fetching deps.'
                        : phase === 'compiling'
                          ? 'Waiting for the first successful page render.'
                          : 'See the error overlay or open the log for details.'}
                  </p>
                </div>
              </div>
            )}

            {preview && (preview.phase === 'error' || preview.compileErrors.length > 0) && (
              <CompileErrorOverlay
                preview={preview}
                onRetry={() => launch(true)}
                onOpenLog={() => setShowLog(true)}
              />
            )}
          </div>

          {showLog && (
            <pre className="max-h-[240px] overflow-y-auto border-t border-ob-line bg-ob-bg p-4 font-mono text-[11px] leading-relaxed text-ob-muted">
              {preview?.log.length ? preview.log.join('\n') : 'No log output yet.'}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: PreviewState['phase'] }) {
  const variant = (() => {
    switch (phase) {
      case 'live':
      case 'first-paint':
        return 'signal' as const;
      case 'compiling':
      case 'installing':
        return 'warn' as const;
      case 'error':
        return 'muted' as const;
      default:
        return 'default' as const;
    }
  })();
  return <Badge variant={variant}>{phase}</Badge>;
}
