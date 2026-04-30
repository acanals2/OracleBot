'use client';

import Link from 'next/link';
import { MarketingNav } from '@/components/layout/MarketingNav';
import { Button } from '@/components/ui/Button';
import { RotatingWord } from '@/components/ui/RotatingWord';
import { ArrowRight, Lock, Radar, ShieldCheck, Zap } from 'lucide-react';
import { MODES, MODE_BY_SLUG, type ModeSlug } from '@/data/modes';

const ROTATING_FAILURES: Partial<Record<ModeSlug, string[]>> = {
  agent: [
    'prompt injections',
    'hallucinations',
    'jailbreaks',
    'system prompt leaks',
    'off-topic drift',
  ],
  site: ['race conditions', 'funnel leaks', 'load cliffs', 'cold-start lag', 'auth brittleness'],
  api: [
    'auth bypasses',
    'malformed-input crashes',
    'rate-limit cliffs',
    'N+1 queries',
    'race conditions',
  ],
  stack: [
    'integration bugs',
    'AI cost runaway',
    'latency cascades',
    'state drift',
    'end-to-end failures',
  ],
};

export function ModePageContent({ slug }: { slug: ModeSlug }) {
  const mode = MODE_BY_SLUG[slug];
  if (!mode) return null;
  const Icon = mode.icon;
  const otherModes = MODES.filter((m) => m.slug !== mode.slug);
  const rotatingFailures = ROTATING_FAILURES[mode.slug];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[length:64px_64px] bg-grid-pattern opacity-[0.55]"
        style={{
          maskImage: 'radial-gradient(ellipse at 50% 0%, black 20%, transparent 75%)',
        }}
      />
      <MarketingNav />

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-ob-signal">
                {mode.hero.eyebrow}
              </p>
              <h1 className="mt-4 font-display text-4xl font-normal leading-[1.05] tracking-tight text-ob-ink sm:text-5xl lg:text-[3.25rem] text-balance">
                {rotatingFailures ? (
                  <>
                    Find the <RotatingWord words={rotatingFailures} interval={2000} />{' '}
                    <span className="text-ob-signal">before your users do</span>.
                  </>
                ) : (
                  <>
                    {mode.hero.title}{' '}
                    <span className="text-ob-signal">{mode.hero.titleAccent}</span>
                    {mode.hero.titleAfter}
                  </>
                )}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ob-muted">
                {mode.hero.body}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app/tests/new">
                  <Button size="lg">
                    Run {/^[aeiou]/i.test(mode.tag) ? 'an' : 'a'}{' '}
                    {mode.tag.replace(' Mode', '').toLowerCase()} test
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
                <a href="/sample-readiness-report.html" target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="lg">
                    See a sample report
                  </Button>
                </a>
              </div>
              <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px] text-ob-dim">
                <span className="inline-flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-ob-signal" />
                  Air-gapped sandbox
                </span>
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-ob-signal" />
                  Authorized targets only
                </span>
                <span className="inline-flex items-center gap-2">
                  <Radar className="h-3.5 w-3.5 text-ob-signal" />
                  Audit trail per run
                </span>
              </p>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-ob-signal/15 via-transparent to-ob-warn/10 blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-ob-line-strong bg-ob-surface shadow-card">
                <div className="flex items-center gap-2 border-b border-ob-line px-4 py-3">
                  <span className="h-2 w-2 rounded-full bg-red-400/80" />
                  <span className="h-2 w-2 rounded-full bg-ob-warn/80" />
                  <span className="h-2 w-2 rounded-full bg-ob-signal/80" />
                  <span className="ml-2 font-mono text-[10px] text-ob-dim">
                    oracle.bot/{mode.slug}/runs/a3f92c1
                  </span>
                </div>
                <div className="space-y-4 p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className="h-6 w-6 text-ob-signal" />
                      <div>
                        <p className="text-xs text-ob-muted">{mode.tag} · commit a3f92c1</p>
                        <p className="font-mono text-sm text-ob-ink">5,000 personas</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-ob-signal/15 px-2 py-0.5 font-mono text-[10px] text-ob-signal">
                      AIR-GAPPED
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {mode.reportPreview.map((c) => (
                      <div key={c.label} className="rounded-lg border border-ob-line bg-ob-bg/80 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-ob-dim">{c.label}</p>
                        <p className="mt-1 font-mono text-xs text-ob-ink">{c.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="h-24 rounded-lg bg-gradient-to-t from-ob-signal/20 to-transparent ring-1 ring-ob-line">
                    <div className="flex h-full items-end gap-0.5 px-2 pb-2 pt-4">
                      {Array.from({ length: 32 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm bg-ob-signal/40"
                          style={{ height: `${20 + ((i * 7) % 55)}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5 border-t border-ob-line pt-3 font-mono text-[11px] text-ob-muted">
                    {mode.events.map((e) => (
                      <p key={e}>{e}</p>
                    ))}
                    <p className="text-ob-signal">✓ no public requests · sandbox destroyed</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-ob-line bg-ob-surface/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">
                  What {mode.tag} finds
                </p>
                <h2 className="mt-3 font-display text-3xl text-ob-ink">
                  The bugs your existing tests can&apos;t see.
                </h2>
                <p className="mt-4 text-ob-muted">
                  Unit and integration tests prove a single flow works. Oracle Bot proves a population of
                  users doesn&apos;t break it.
                </p>
              </div>
              <ul className="space-y-3">
                {mode.finds.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-3 rounded-xl border border-ob-line bg-ob-bg/40 px-4 py-3"
                  >
                    <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-ob-signal shadow-[0_0_8px_var(--tw-shadow-color)] shadow-ob-signal" />
                    <span className="text-sm text-ob-muted">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">
              Scenario library
            </p>
            <h2 className="mt-3 font-display text-3xl text-ob-ink">
              Pre-built scenarios. Or roll your own.
            </h2>
            <p className="mt-3 max-w-2xl text-ob-muted">
              Pick from {mode.tag.toLowerCase()} scenarios tuned to your workload, or compose a custom mix
              of personas, intents, and intensities.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {mode.scenarios.map((s) => (
                <div
                  key={s.name}
                  className="rounded-2xl border border-ob-line bg-ob-surface/40 p-6 transition-colors hover:border-ob-signal/25"
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ob-signal">
                    {s.name}
                  </p>
                  <p className="mt-3 text-sm text-ob-ink">{s.example}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ob-line bg-ob-surface/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">Who it&apos;s for</p>
            <h2 className="mt-3 font-display text-3xl text-ob-ink">
              {mode.tag} is built for the people shipping&nbsp;
              <span className="text-ob-signal">right now</span>.
            </h2>
            <ul className="mt-8 grid gap-3 md:grid-cols-3">
              {mode.customer.map((c) => (
                <li
                  key={c}
                  className="rounded-2xl border border-ob-line bg-ob-bg/60 p-5 font-mono text-[12px] text-ob-muted"
                >
                  → {c}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">
              The full platform
            </p>
            <h2 className="mt-3 font-display text-3xl text-ob-ink">
              {mode.tag} is one of four modes. Same architecture. Different surface.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {otherModes.map((m) => {
                const MIcon = m.icon;
                return (
                  <Link
                    key={m.slug}
                    href={`/modes/${m.slug}`}
                    className={`group rounded-2xl border p-6 transition-colors ${
                      m.signature
                        ? 'border-ob-signal/40 bg-ob-signal/[0.04] hover:border-ob-signal/60'
                        : 'border-ob-line bg-ob-surface/40 hover:border-ob-signal/25'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <MIcon className="h-6 w-6 text-ob-signal" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ob-signal">
                        {m.tag}
                      </span>
                    </div>
                    <p className="mt-4 text-sm text-ob-ink">{m.hero.title.split('.')[0]}.</p>
                    <p className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-ob-muted group-hover:text-ob-signal">
                      Explore {m.tag} <ArrowRight className="h-3 w-3" />
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-t border-ob-line py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <Zap className="mx-auto h-10 w-10 text-ob-signal" />
            <h2 className="mt-6 font-display text-3xl text-ob-ink sm:text-4xl">
              Run your first {mode.tag.toLowerCase()} test.
            </h2>
            <p className="mt-4 text-ob-muted">
              From repo to readiness report in under an hour. Hard cap on cost — no surprise bills.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/app/tests/new">
                <Button size="lg">
                  Start a run <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <a href="/sample-readiness-report.html" target="_blank" rel="noreferrer">
                <Button variant="secondary" size="lg">
                  See a sample Oracle Report
                </Button>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ob-line py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <p className="text-xs text-ob-dim">© 2026 Oracle Bot — Agent Testing Platform.</p>
          <Link href="/safety" className="text-xs text-ob-muted hover:text-ob-signal">
            Trust &amp; containment
          </Link>
        </div>
      </footer>
    </div>
  );
}
