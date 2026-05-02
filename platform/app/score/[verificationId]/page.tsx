/**
 * Public score page — Phase 14.
 *
 *   GET /score/<verificationId>
 *
 * No auth required. Shows the same data the SVG badge encodes, plus the
 * embed snippets users paste into READMEs, npm pages, and dashboards.
 * Falls back gracefully when the verification is missing, pending, or no
 * runs have hit the verified domain yet.
 */
import type { Metadata } from 'next';
import {
  ageLabel,
  colorForScore,
  gradeForScore,
  resolveBadge,
  type BadgeState,
} from '@/lib/badge';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

interface PageProps {
  params: Promise<{ verificationId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { verificationId } = await params;
  return {
    title: 'OracleBot Readiness Score',
    description: `Public readiness score for verified target ${verificationId}.`,
    robots: { index: false, follow: false },
  };
}

export default async function ScorePage({ params }: PageProps) {
  const { verificationId } = await params;
  const state = await resolveBadge(verificationId);
  const badgeUrl = `${APP_URL}/api/badge/${verificationId}.svg`;
  const pageUrl = `${APP_URL}/score/${verificationId}`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 font-sans text-ob-ink">
      <header className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ob-dim">
          OracleBot · Readiness
        </p>
        <h1 className="mt-2 font-display text-3xl text-ob-ink">Readiness Score</h1>
      </header>

      <ScoreCard state={state} />

      {(state.kind === 'fresh' || state.kind === 'stale') && (
        <EmbedSnippets badgeUrl={badgeUrl} pageUrl={pageUrl} />
      )}

      <footer className="mt-12 border-t border-ob-line pt-6 font-mono text-[11px] uppercase tracking-wider text-ob-dim">
        <a href={APP_URL} className="hover:text-ob-ink">
          ← oraclebot.net
        </a>
      </footer>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Score card — discriminated render per badge state
// ────────────────────────────────────────────────────────────────────────────

function ScoreCard({ state }: { state: BadgeState }) {
  if (state.kind === 'unverified') {
    return (
      <div className="rounded-xl border border-ob-line bg-ob-surface p-8">
        <p className="font-mono text-[11px] uppercase tracking-wider text-ob-dim">Status</p>
        <p className="mt-2 font-display text-xl text-ob-ink">Not verified</p>
        <p className="mt-3 text-sm text-ob-muted">
          {unverifiedReason(state.reason)}
        </p>
      </div>
    );
  }

  if (state.kind === 'no_runs') {
    return (
      <div className="rounded-xl border border-ob-line bg-ob-surface p-8">
        <p className="font-mono text-[11px] uppercase tracking-wider text-ob-dim">
          {state.verification.domain}
        </p>
        <p className="mt-2 font-display text-xl text-ob-ink">No completed runs yet</p>
        <p className="mt-3 text-sm text-ob-muted">
          The domain is verified but OracleBot hasn&apos;t finished a run against it. Once
          a run completes the score will appear here automatically.
        </p>
      </div>
    );
  }

  if (state.kind === 'expired_run') {
    return (
      <div className="rounded-xl border border-ob-line bg-ob-surface p-8">
        <p className="font-mono text-[11px] uppercase tracking-wider text-ob-dim">
          {state.verification.domain}
        </p>
        <p className="mt-2 font-display text-xl text-ob-ink">Score expired</p>
        <p className="mt-3 text-sm text-ob-muted">
          The most recent run for this target completed {ageLabel(state.ageMs)} —
          beyond the 30-day freshness window. Re-run OracleBot against this target
          to re-publish a current score.
        </p>
      </div>
    );
  }

  // fresh or stale — both render the score, only color/labeling differs.
  const isFresh = state.kind === 'fresh';
  const tone = isFresh ? colorForScore(state.score) : 'gray';
  const numeric = `${state.score}/100`;

  return (
    <div className="rounded-xl border border-ob-line bg-ob-surface p-8">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[11px] uppercase tracking-wider text-ob-dim">
          {state.verification.domain}
        </p>
        <p className="font-mono text-[11px] uppercase tracking-wider text-ob-dim">
          {ageLabel(state.ageMs)}
        </p>
      </div>

      <div className="mt-6 flex items-baseline gap-4">
        <p
          className={`font-display text-6xl ${toneClass(tone)} tabular-nums`}
          aria-label={`Score: ${numeric}`}
        >
          {state.score}
        </p>
        <p className="font-mono text-2xl text-ob-muted tabular-nums">/ 100</p>
        <span
          className={`ml-auto rounded-md border px-2 py-1 font-mono text-xs uppercase tracking-wider ${
            isFresh ? toneBorderClass(tone) : 'border-ob-line text-ob-dim'
          }`}
        >
          {isFresh ? `Grade ${gradeForScore(state.score)}` : 'Stale'}
        </span>
      </div>

      {!isFresh && (
        <p className="mt-4 text-sm text-ob-muted">
          The most recent run completed {ageLabel(state.ageMs)} — beyond the
          14-day freshness window. The badge appears in muted colors until a
          fresher run replaces it.
        </p>
      )}
    </div>
  );
}

function unverifiedReason(reason: 'not_found' | 'pending' | 'failed' | 'expired'): string {
  switch (reason) {
    case 'not_found':
      return 'No verification with that id. The id in the URL might be wrong, or the verification has been deleted.';
    case 'pending':
      return 'Domain verification is still pending. The owner needs to publish the DNS TXT record or well-known file before the score can go public.';
    case 'failed':
      return 'Domain verification failed. The owner needs to re-run the verification check before publishing a score.';
    case 'expired':
      return 'The domain verification has expired. The owner needs to re-verify before the score can be displayed.';
  }
}

function toneClass(tone: 'green' | 'yellow' | 'red' | 'gray'): string {
  switch (tone) {
    case 'green':
      return 'text-ob-signal';
    case 'yellow':
      return 'text-ob-warn';
    case 'red':
      return 'text-ob-danger';
    case 'gray':
      return 'text-ob-muted';
  }
}

function toneBorderClass(tone: 'green' | 'yellow' | 'red' | 'gray'): string {
  switch (tone) {
    case 'green':
      return 'border-ob-signal/40 bg-ob-signal/10 text-ob-signal';
    case 'yellow':
      return 'border-ob-warn/40 bg-ob-warn/10 text-ob-warn';
    case 'red':
      return 'border-ob-danger/40 bg-ob-danger/10 text-ob-danger';
    case 'gray':
      return 'border-ob-line text-ob-dim';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Embed snippets
// ────────────────────────────────────────────────────────────────────────────

function EmbedSnippets({
  badgeUrl,
  pageUrl,
}: {
  badgeUrl: string;
  pageUrl: string;
}) {
  const markdown = `[![OracleBot Readiness](${badgeUrl})](${pageUrl})`;
  const html = `<a href="${pageUrl}"><img src="${badgeUrl}" alt="OracleBot Readiness" /></a>`;

  return (
    <section className="mt-8">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-ob-dim">
        Embed this badge
      </h2>
      <div className="mt-3 space-y-4">
        <SnippetBlock label="Markdown" code={markdown} />
        <SnippetBlock label="HTML" code={html} />
        <SnippetBlock label="Image URL" code={badgeUrl} />
      </div>
    </section>
  );
}

function SnippetBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="rounded-lg border border-ob-line bg-ob-bg/40">
      <div className="flex items-center justify-between border-b border-ob-line/50 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
          {label}
        </span>
      </div>
      <pre className="overflow-x-auto px-3 py-2 font-mono text-xs text-ob-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}
