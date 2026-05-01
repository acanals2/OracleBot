'use client';

/**
 * Run-creation wizard.
 *
 * Wired against POST /api/runs. The bot engine is intentionally not in scope
 * yet — submitting persists a `runs` row in `queued` status, enqueues the
 * job, and redirects to the live monitor. The worker will pick up the job
 * once the bot engine + sandbox provisioner are wired.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { AlertOctagon, ChevronRight, Globe, Layers, MessageSquare, Terminal } from 'lucide-react';
import { PRODUCTS, formatPrice, estimateRunCostCents } from '@/lib/billing';
import { VerificationStatusInline } from '@/components/run-wizard/VerificationStatusInline';

type Mode = 'site' | 'agent' | 'api' | 'stack';
type TargetKind = 'repo' | 'docker' | 'liveUrl' | 'agent';

const STEPS = ['Mode', 'Target', 'Tier & limits', 'Review'] as const;

const MODE_CARDS: { id: Mode; icon: typeof Globe; title: string; body: string }[] = [
  { id: 'site', icon: Globe, title: 'Site', body: 'Synthetic users complete real flows on your site.' },
  { id: 'agent', icon: MessageSquare, title: 'Agent', body: 'Adversarial conversation against your AI agent.' },
  { id: 'api', icon: Terminal, title: 'API', body: 'Realistic + fuzzed traffic against endpoints.' },
  { id: 'stack', icon: Layers, title: 'Stack', body: 'Full product end-to-end (signature mode).' },
];

// Order matters: the first kind in each list is the auto-selected default
// when the user enters Step 2. liveUrl/agent are listed first because they
// don't require an E2B sandbox (which is gated behind E2B_API_KEY and not
// yet wired in production) — so the default path is the one that works
// without any extra setup.
const TARGETS_BY_MODE: Record<Mode, TargetKind[]> = {
  site: ['liveUrl', 'repo', 'docker'],
  agent: ['agent', 'repo'],
  api: ['liveUrl', 'repo', 'docker'],
  stack: ['repo', 'docker'],
};

// Target kinds that require an E2B microVM sandbox. These are surfaced with
// a "needs E2B" warning so users don't pick them blindly only to fail at
// provisioning. Phase 12 of the partner handoff wires E2B — until then,
// these are best-effort and will fail with a clear message at run time.
const E2B_REQUIRED: ReadonlySet<TargetKind> = new Set(['repo', 'docker']);

export function NewRunWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>('site');
  const [name, setName] = useState('');
  // Initial kind matches the default mode's first allowed kind so the wizard
  // shows the URL input on first paint instead of the GitHub-repo input.
  // If the user clicks Continue without re-selecting the mode, we still want
  // the no-E2B path. The mode-change effect below also keeps these in sync.
  const [target, setTarget] = useState<{
    kind: TargetKind;
    repoUrl?: string;
    image?: string;
    url?: string;
    endpoint?: string;
  }>({ kind: TARGETS_BY_MODE.site[0], url: '' });

  // If the user changes mode and the current target.kind isn't allowed for
  // the new mode, snap it to the first allowed kind for that mode. Prevents
  // submitting a (mode=stack, kind=liveUrl) combo or — more importantly —
  // a (mode=site, kind=repo) combo when the user just typed a URL.
  useEffect(() => {
    const allowed = TARGETS_BY_MODE[mode];
    if (!allowed.includes(target.kind)) {
      setTarget({ kind: allowed[0], repoUrl: '', image: '', url: '', endpoint: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const [productKey, setProductKey] = useState<'scout' | 'builder' | 'studio' | 'stack'>('builder');
  const [hardCapDollars, setHardCapDollars] = useState<number>(50);

  const product = PRODUCTS.find((p) => p.key === productKey)!;
  const botCount = product.maxBots;
  const durationMinutes = product.durationMinutes;
  const estimatedCostCents = estimateRunCostCents({
    productKey,
    botCount,
    durationMinutes,
  });

  async function handleLaunch() {
    setSubmitting(true);
    setError(null);
    try {
      const targetPayload =
        target.kind === 'repo'
          ? { kind: 'repo' as const, repoUrl: target.repoUrl ?? '' }
          : target.kind === 'docker'
            ? { kind: 'docker' as const, image: target.image ?? '' }
            : target.kind === 'liveUrl'
              ? { kind: 'liveUrl' as const, url: target.url ?? '' }
              : { kind: 'agent' as const, endpoint: target.endpoint ?? '' };

      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          name: name || `${mode} run · ${new Date().toISOString().slice(0, 10)}`,
          productKey,
          botCount,
          durationMinutes,
          target: targetPayload,
          hardCapCents: hardCapDollars * 100,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? 'Failed to create run.');
      }
      router.push(`/app/tests/${json.data.runId}/live`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Stepper */}
      <div className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(i)}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${
              i === step
                ? 'bg-ob-signal/15 text-ob-signal ring-1 ring-ob-signal/35'
                : 'bg-ob-surface text-ob-muted ring-1 ring-ob-line'
            }`}
          >
            <span className="opacity-60">0{i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      {/* Step 0 — pick a mode */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a mode</CardTitle>
            <CardDescription>
              Each mode targets a different surface. You can always run more modes later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {MODE_CARDS.map(({ id, icon: Icon, title, body }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMode(id);
                    // Auto-pick a sensible default target kind for the mode
                    const allowed = TARGETS_BY_MODE[id];
                    setTarget({ kind: allowed[0], repoUrl: '', image: '', url: '', endpoint: '' });
                  }}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                    mode === id
                      ? 'border-ob-signal/50 bg-ob-signal/5'
                      : 'border-ob-line bg-ob-surface/50 hover:border-ob-signal/30'
                  }`}
                >
                  <Icon className="h-5 w-5 text-ob-signal" />
                  <div>
                    <p className="font-mono text-sm text-ob-ink">{title} mode</p>
                    <p className="mt-1 text-xs text-ob-muted">{body}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setStep(1)}>
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1 — target */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Connect your target</CardTitle>
            <CardDescription>
              We&apos;ll provision an air-gapped sandbox from this. You may only test systems you own
              or are explicitly authorized to test.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-ob-warn/25 bg-ob-warn/5 p-4 text-sm text-ob-muted">
              <div className="flex gap-2 font-medium text-ob-warn">
                <AlertOctagon className="h-4 w-4 shrink-0" />
                Authorized targets only
              </div>
              <p className="mt-2">
                Oracle Bot tests only systems you own. Targets that look like production traffic, or
                that fail domain ownership verification, are auto-rejected.
              </p>
            </div>

            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ob-dim">
                Target type
              </p>
              <div className="flex flex-wrap gap-2">
                {TARGETS_BY_MODE[mode].map((kind) => {
                  const isActive = target.kind === kind;
                  const needsE2B = E2B_REQUIRED.has(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setTarget({ ...target, kind })}
                      aria-pressed={isActive}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                        isActive
                          ? 'border-ob-signal/60 bg-ob-signal/15 text-ob-signal ring-1 ring-ob-signal/40'
                          : 'border-ob-line bg-ob-surface/50 text-ob-muted hover:text-ob-ink'
                      }`}
                    >
                      {kind === 'repo' && 'GitHub repo'}
                      {kind === 'docker' && 'Docker image'}
                      {kind === 'liveUrl' && 'Live URL (verified)'}
                      {kind === 'agent' && 'Agent endpoint'}
                      {needsE2B && (
                        <span className="rounded bg-ob-warn/15 px-1 py-0.5 text-[9px] text-ob-warn">
                          needs E2B
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {E2B_REQUIRED.has(target.kind) && (
                <p className="mt-2 text-xs text-ob-warn">
                  This target type provisions an E2B microVM sandbox, which requires
                  E2B_API_KEY to be set on the worker. If you haven&apos;t configured E2B,
                  pick <strong>Live URL</strong> and point at a deployed staging URL instead.
                </p>
              )}
            </div>

            {target.kind === 'repo' && (
              <div className="space-y-2">
                <Label htmlFor="repo">GitHub repository URL</Label>
                <Input
                  id="repo"
                  placeholder="https://github.com/your-org/your-repo"
                  value={target.repoUrl ?? ''}
                  onChange={(e) => setTarget({ ...target, repoUrl: e.target.value })}
                />
              </div>
            )}
            {target.kind === 'docker' && (
              <div className="space-y-2">
                <Label htmlFor="img">Docker image (registry path + tag)</Label>
                <Input
                  id="img"
                  placeholder="ghcr.io/your-org/your-app:staging"
                  value={target.image ?? ''}
                  onChange={(e) => setTarget({ ...target, image: e.target.value })}
                />
              </div>
            )}
            {target.kind === 'liveUrl' && (
              <div className="space-y-2">
                <Label htmlFor="url">Staging URL (must pass domain verification)</Label>
                <Input
                  id="url"
                  placeholder="https://staging.yourproduct.com"
                  value={target.url ?? ''}
                  onChange={(e) => setTarget({ ...target, url: e.target.value })}
                />
                <VerificationStatusInline url={target.url ?? ''} />
              </div>
            )}
            {target.kind === 'agent' && (
              <div className="space-y-2">
                <Label htmlFor="endpoint">Agent endpoint URL</Label>
                <Input
                  id="endpoint"
                  placeholder="https://your-agent.example.com/api/chat"
                  value={target.endpoint ?? ''}
                  onChange={(e) => setTarget({ ...target, endpoint: e.target.value })}
                />
                <VerificationStatusInline url={target.endpoint ?? ''} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Run name (optional)</Label>
              <Input
                id="name"
                placeholder={`${mode} run · ${new Date().toISOString().slice(0, 10)}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => setStep(2)}>
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2 — tier & limits */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Tier &amp; cost cap</CardTitle>
            <CardDescription>
              Pick a tier. Set a hard cap on this run&apos;s cost — we&apos;ll never charge more.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {PRODUCTS.filter((p) => p.publicListed && p.type !== 'metered').map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() =>
                    setProductKey(p.key as 'scout' | 'builder' | 'studio' | 'stack')
                  }
                  className={`rounded-xl border p-4 text-left ${
                    productKey === p.key
                      ? 'border-ob-signal/50 bg-ob-signal/[0.04]'
                      : 'border-ob-line bg-ob-surface/40 hover:border-ob-signal/30'
                  }`}
                >
                  <p className="font-display text-base text-ob-ink">{p.name}</p>
                  <p className="mt-1 font-mono text-lg text-ob-signal">{formatPrice(p.priceCents)}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ob-dim">
                    {p.cadence}
                  </p>
                  <p className="mt-2 text-xs text-ob-muted">{p.summary}</p>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-ob-line bg-ob-bg/40 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ob-dim">
                Estimated cost (this run)
              </p>
              <p className="mt-1 font-mono text-2xl text-ob-ink">
                {formatPrice(estimatedCostCents)}
              </p>
              <p className="mt-1 text-xs text-ob-muted">
                {botCount.toLocaleString()} personas × {durationMinutes} minutes — included in your
                tier with overage at $0.04/persona-minute.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cap">Hard cap (USD)</Label>
              <Input
                id="cap"
                type="number"
                min={1}
                value={hardCapDollars}
                onChange={(e) => setHardCapDollars(Math.max(1, Number(e.target.value) || 0))}
              />
              <p className="text-xs text-ob-muted">
                We&apos;ll auto-pause the run if cost approaches this cap.
              </p>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Review <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — review */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review &amp; launch</CardTitle>
            <CardDescription>
              Last check. Submitting will queue the run — you&apos;ll be redirected to the live
              monitor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 rounded-xl border border-ob-line bg-ob-surface/40 p-4 sm:grid-cols-2">
              <Field label="Mode" value={mode} mono />
              <Field label="Tier" value={`${product.name} · ${formatPrice(product.priceCents)}`} />
              <Field
                label="Target"
                value={
                  target.kind === 'repo'
                    ? target.repoUrl
                    : target.kind === 'docker'
                      ? target.image
                      : target.kind === 'liveUrl'
                        ? target.url
                        : target.endpoint
                }
                mono
              />
              <Field label="Bots × duration" value={`${botCount.toLocaleString()} × ${durationMinutes} min`} mono />
              <Field label="Estimated cost" value={formatPrice(estimatedCostCents)} mono />
              <Field label="Hard cap" value={`$${hardCapDollars}`} mono />
            </div>

            {error && (
              <div className="rounded-lg border border-ob-danger/40 bg-ob-danger/10 p-4 text-sm text-ob-danger">
                {error}
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={submitting}>
                Back
              </Button>
              <Button onClick={handleLaunch} disabled={submitting}>
                {submitting ? 'Launching…' : 'Launch run'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-wider text-ob-dim">{label}</p>
      <p className={`mt-1 text-sm text-ob-ink ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}
