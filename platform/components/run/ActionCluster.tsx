'use client';

/**
 * Right-rail action cluster for the run hero. Renders different sets of
 * controls depending on run lifecycle state and read-only mode.
 *
 * Live + write mode  →  Cancel run, Share live, kebab menu
 * Live + read mode   →  (nothing — spectator can't act)
 * Terminal           →  Open report, kebab menu
 *
 * Share-live calls POST /api/runs/[id]/share, copies the public spectator
 * URL to the clipboard, and fires a toast. The kebab menu groups secondary
 * actions: copy run ID, copy spectator URL (if a token already exists),
 * open raw run JSON, re-run with same config.
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  ExternalLink,
  FileText,
  MoreVertical,
  RefreshCw,
  Share2,
  Square,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useLiveRun } from './LiveRunProvider';

const TERMINAL = new Set(['completed', 'failed', 'canceled', 'timed_out']);

interface Props {
  /** Hide all write actions when rendered in spectator mode. */
  readOnly?: boolean;
}

export function ActionCluster({ readOnly = false }: Props) {
  const { run, status, shareToken } = useLiveRun();
  const isLive = !TERMINAL.has(status);
  const isCompleted = status === 'completed';
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  if (readOnly) {
    return isCompleted && shareToken ? (
      <Link href={`/share/${shareToken}/results`} aria-label="Open report">
        <Button size="sm" variant="secondary">
          <FileText className="mr-2 h-4 w-4" />
          Open report
        </Button>
      </Link>
    ) : null;
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.show(`${label} copied`))
      .catch(() => toast.show(`Failed to copy ${label}`, { kind: 'error' }));
  };

  const handleShareLive = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await fetch(`/api/runs/${run.id}/share`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? 'Share failed');
      }
      const token = json.data?.token;
      if (!token) throw new Error('No share token returned');
      const url = `${window.location.origin}/share/${token}`;
      setShareUrl(url);
      handleCopy(url, 'Share URL');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Share failed', { kind: 'error' });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isLive && (
        <form action={`/api/runs/${run.id}/cancel`} method="POST">
          <Button type="submit" variant="secondary" size="sm">
            <Square className="mr-2 h-3.5 w-3.5" />
            Cancel run
          </Button>
        </form>
      )}
      {isLive && (
        <Button onClick={handleShareLive} disabled={sharing} variant="secondary" size="sm">
          <Share2 className="mr-2 h-3.5 w-3.5" />
          {sharing ? 'Sharing…' : 'Share live'}
        </Button>
      )}
      {isCompleted && (
        <Link href={`/app/tests/${run.id}/results`}>
          <Button size="sm">
            <FileText className="mr-2 h-3.5 w-3.5" />
            Open report
          </Button>
        </Link>
      )}
      <KebabMenu run={run} shareUrl={shareUrl} onCopy={handleCopy} />
    </div>
  );
}

function KebabMenu({
  run,
  shareUrl,
  onCopy,
}: {
  run: { id: string; mode: string };
  shareUrl: string | null;
  onCopy: (text: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false);
    };
    const esc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-lg border border-ob-line bg-ob-surface shadow-lg backdrop-blur-md"
        >
          <MenuItem
            icon={Copy}
            label="Copy run ID"
            onSelect={() => {
              onCopy(run.id, 'Run ID');
              setOpen(false);
            }}
          />
          {shareUrl && (
            <MenuItem
              icon={Copy}
              label="Copy spectator URL"
              onSelect={() => {
                onCopy(shareUrl, 'Spectator URL');
                setOpen(false);
              }}
            />
          )}
          <MenuItem
            icon={ExternalLink}
            label="Open raw run JSON"
            href={`/api/runs/${run.id}`}
            onSelect={() => setOpen(false)}
          />
          <MenuItem
            icon={RefreshCw}
            label="Re-run with same config"
            href={`/app/tests/new?from=${run.id}`}
            onSelect={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  href,
  onSelect,
}: {
  icon: typeof Copy;
  label: string;
  href?: string;
  onSelect: () => void;
}) {
  const className =
    'flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs text-ob-muted transition-colors hover:bg-ob-bg/60 hover:text-ob-ink';
  if (href) {
    return (
      <a
        role="menuitem"
        href={href}
        target={href.startsWith('/api/') ? '_blank' : undefined}
        rel={href.startsWith('/api/') ? 'noreferrer' : undefined}
        onClick={onSelect}
        className={className}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onSelect} className={className}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label}
    </button>
  );
}
