'use client';

/**
 * Publish-your-score card — Phase 14 share-after-pass UX.
 *
 * Renders below the metrics on the results page when a run completed with
 * a passing score AND its target domain has an active verification. Shows:
 *   - The live badge SVG (so users see exactly what they'd embed)
 *   - One-click copy buttons for Markdown / HTML / image URL snippets
 *   - A link to the public score page
 *
 * If the domain isn't verified yet, we render a prompt to verify it first.
 */
import { useState } from 'react';
import { Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface Props {
  /** Verification id, or null if the run's target isn't verified. */
  verificationId: string | null;
  /** Absolute URL of this app — used to build embed snippets. */
  appUrl: string;
  /** The run's readiness score, used for the "passing" gate. */
  score: number;
  /** Hostname extracted from the run's target — shown in the prompt. */
  targetHost: string | null;
}

const PASSING_THRESHOLD = 70;

export function PublishScoreCard({ verificationId, appUrl, score, targetHost }: Props) {
  if (score < PASSING_THRESHOLD) return null;

  if (!verificationId) {
    return <UnverifiedPrompt targetHost={targetHost} />;
  }

  const badgeUrl = `${appUrl}/api/badge/${verificationId}.svg`;
  const pageUrl = `${appUrl}/score/${verificationId}`;
  const markdown = `[![OracleBot Readiness](${badgeUrl})](${pageUrl})`;
  const html = `<a href="${pageUrl}"><img src="${badgeUrl}" alt="OracleBot Readiness" /></a>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Publish your score</CardTitle>
          <a
            href={pageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-ob-signal hover:underline"
          >
            View public page <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-ob-line bg-ob-bg/40 p-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
            Live preview
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badgeUrl} alt="OracleBot Readiness" className="mt-2 h-5" />
        </div>

        <SnippetRow label="Markdown" code={markdown} />
        <SnippetRow label="HTML" code={html} />
        <SnippetRow label="Image URL" code={badgeUrl} />

        <p className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
          Score expires after 14 days without a fresh run · stale badge after that
        </p>
      </CardContent>
    </Card>
  );
}

function UnverifiedPrompt({ targetHost }: { targetHost: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Publish your score</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3 rounded-lg border border-ob-line bg-ob-bg/40 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ob-muted" />
          <div className="space-y-3">
            <p className="text-sm text-ob-ink">
              Verify ownership of{' '}
              <span className="font-mono">{targetHost ?? 'this target'}</span> to
              publish a public readiness badge for it.
            </p>
            <p className="text-xs text-ob-muted">
              Badges are tied to verified domains so other people can&apos;t pass off
              your score as their own. Verification takes about 60 seconds — DNS TXT
              record or a well-known file.
            </p>
            <a href="/app/settings/domains">
              <Button variant="secondary" size="sm">
                Verify domain
              </Button>
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SnippetRow({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be blocked in some contexts; ignore.
    }
  };

  return (
    <div className="rounded-lg border border-ob-line bg-ob-bg/40">
      <div className="flex items-center justify-between border-b border-ob-line/50 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-ob-muted hover:text-ob-ink"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-xs text-ob-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}
