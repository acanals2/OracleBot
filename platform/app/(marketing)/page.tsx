'use client';

import Link from 'next/link';
import { MarketingNav } from '@/components/layout/MarketingNav';
import { Button } from '@/components/ui/Button';
import { RotatingWord } from '@/components/ui/RotatingWord';
import {
  ArrowRight,
  Bot,
  Box,
  Cpu,
  Globe,
  Layers,
  Lock,
  MessageSquare,
  Radar,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  UserCheck,
  Workflow,
  Zap,
} from 'lucide-react';

export default function LandingPage() {
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
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-ob-signal">
                The first Agent Testing Platform · Unified Bot Architecture
              </p>
              <h1 className="mt-4 font-display text-4xl font-normal leading-[1.05] tracking-tight text-ob-ink sm:text-5xl lg:text-[3.5rem] text-balance">
                Test your{' '}
                <RotatingWord
                  words={['AI app', 'agent', 'API', 'site', 'full stack']}
                  interval={2000}
                />{' '}
                the way users actually <span className="text-ob-signal">break it</span>.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ob-muted">
                Oracle Bot tests your site, your agent, your API, and your full stack — through one
                unified bot architecture, in one sandboxed run, with one report. Find the bugs,
                prompt injections, and edge cases <em className="text-ob-ink">before your users do</em>.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/app/tests/new">
                  <Button size="lg">
                    Run a test <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
                <a href="/sample-readiness-report.html" target="_blank" rel="noreferrer">
                  <Button variant="secondary" size="lg">
                    See a sample Oracle Report
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
                    oracle.bot/runs/a3f92c1
                  </span>
                </div>
                <div className="space-y-4 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-ob-muted">Stack mode · commit a3f92c1</p>
                      <p className="font-mono text-lg text-ob-ink">5,000 personas · adversarial mix</p>
                    </div>
                    <span className="rounded-full bg-ob-signal/15 px-2 py-0.5 font-mono text-[10px] text-ob-signal">
                      AIR-GAPPED
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: 'Readiness', v: '87/100' },
                      { l: 'Site', v: '92' },
                      { l: 'Agent', v: '78' },
                    ].map((c) => (
                      <div key={c.l} className="rounded-lg border border-ob-line bg-ob-bg/80 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-ob-dim">{c.l}</p>
                        <p className="mt-1 font-mono text-sm text-ob-ink">{c.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="h-28 rounded-lg bg-gradient-to-t from-ob-signal/20 to-transparent ring-1 ring-ob-line">
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
                    <p>→ agent leaks system prompt to bot_437</p>
                    <p>→ checkout race condition at 412 concurrent</p>
                    <p>→ KYC vendor rate-limited at 1.2k signups/min</p>
                    <p className="text-ob-signal">✓ no public requests · sandbox destroyed</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* THE FOUR MODES */}
        <section className="border-t border-ob-line bg-ob-surface/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">
              One platform · four modes
            </p>
            <h2 className="mt-3 font-display text-3xl text-ob-ink sm:text-4xl">
              Whatever you built, Oracle Bot can break it.
            </h2>
            <p className="mt-4 max-w-2xl text-ob-muted">
              Existing tools split testing by modality — websites get one tool, AI agents get another,
              APIs get a third. We unified them. One bot architecture tests them all.
            </p>

            <div className="mt-12 grid gap-4 md:grid-cols-2">
              {[
                {
                  icon: Globe,
                  tag: 'Site Mode',
                  title: 'Test what your users see',
                  body: 'Synthetic users complete real flows — signup, checkout, onboarding. Find race conditions, conversion drop-offs, broken flows under load.',
                  finds: 'Race conditions · funnel leaks · load ceilings',
                  href: '/modes/site',
                },
                {
                  icon: MessageSquare,
                  tag: 'Agent Mode',
                  title: 'Test what your agent says',
                  body: 'Synthetic users converse with your AI agent — friendly, hostile, confused, malicious. Find prompt injections, hallucinations, jailbreaks.',
                  finds: 'Prompt injections · hallucinations · system-prompt leaks',
                  href: '/modes/agent',
                },
                {
                  icon: Terminal,
                  tag: 'API Mode',
                  title: 'Test what your endpoints handle',
                  body: 'Synthetic clients hit your API with realistic and adversarial payloads. Find load ceilings, malformed input handling, auth bypasses.',
                  finds: 'Auth gaps · malformed input · rate-limit cliffs',
                  href: '/modes/api',
                },
                {
                  icon: Layers,
                  tag: 'Stack Mode',
                  title: 'Test your full AI product',
                  body: 'One run covers a whole product: site → AI feature → API → back to site. Synthetic users complete real journeys including AI interactions. Nobody else does this.',
                  finds: 'AI cost runaway · latency cascades · end-to-end failures',
                  href: '/modes/stack',
                  signature: true,
                },
              ].map(({ icon: Icon, tag, title, body, finds, href, signature }) => (
                <Link
                  key={tag}
                  href={href}
                  className={`block rounded-2xl border p-7 transition-colors ${
                    signature
                      ? 'border-ob-signal/40 bg-ob-signal/[0.04] hover:border-ob-signal/60'
                      : 'border-ob-line bg-ob-bg/60 hover:border-ob-signal/25'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-7 w-7 text-ob-signal" />
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ob-signal">
                      {tag}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-xl text-ob-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ob-muted">{body}</p>
                  <p className="mt-4 font-mono text-[11px] text-ob-dim">{finds}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* UNIFIED BOT ARCHITECTURE */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">
              Unified Bot Architecture
            </p>
            <h2 className="mt-3 font-display text-3xl text-ob-ink sm:text-4xl">
              One bot primitive. Infinite test scenarios.
            </h2>
            <p className="mt-4 max-w-2xl text-ob-muted">
              Every test is the same atom — a synthetic actor with a persona, an intent, and a modality,
              hitting a target. Existing tools artificially split this. We didn&apos;t.
            </p>

            <div className="mt-12 grid gap-4 md:grid-cols-4">
              {[
                {
                  icon: UserCheck,
                  label: 'Persona',
                  body: 'Demographics, domain skill, tech literacy, patience, native language.',
                },
                {
                  icon: Target,
                  label: 'Intent',
                  body: 'Convert, explore, break, verify, confuse. Friendly through hostile.',
                },
                {
                  icon: Workflow,
                  label: 'Modality',
                  body: 'Web clicks, chat dialog, API calls, voice, mixed multi-step journeys.',
                },
                {
                  icon: Box,
                  label: 'Target',
                  body: 'Sandboxed env from your code, an authorized URL, or an agent endpoint.',
                },
              ].map(({ icon: Icon, label, body }) => (
                <div key={label} className="rounded-2xl border border-ob-line bg-ob-surface/40 p-6">
                  <Icon className="h-6 w-6 text-ob-signal" />
                  <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ob-signal">
                    {label}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-ob-muted">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-ob-line bg-ob-bg/60 p-5 text-center">
              <p className="font-mono text-xs text-ob-muted">
                Persona × Intent × Modality × Target ={' '}
                <span className="text-ob-signal">every test scenario in one architecture</span>
              </p>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="border-t border-ob-line bg-ob-surface/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">
              Connect · Detect · Run · Fix
            </p>
            <h2 className="mt-3 font-display text-3xl text-ob-ink sm:text-4xl">
              From repo to readiness report in under an hour.
            </h2>

            <div className="mt-12 grid gap-4 md:grid-cols-4">
              {[
                {
                  step: '01',
                  icon: Bot,
                  title: 'Connect your target',
                  body: 'GitHub repo, Docker image, live URL with domain auth, or agent endpoint. Your call.',
                },
                {
                  step: '02',
                  icon: Cpu,
                  title: 'We detect what to test',
                  body: 'Oracle scans your target and recommends the right modes — Site, Agent, API, or Stack.',
                },
                {
                  step: '03',
                  icon: Zap,
                  title: 'Bots run in our sandbox',
                  body: 'Air-gapped environment. Thousands of personas exercise real flows. Live event stream.',
                },
                {
                  step: '04',
                  icon: Sparkles,
                  title: 'Fix with one click',
                  body: 'Each issue has a Fix-with-Oracle button. Claude proposes a patch. You review and merge.',
                },
              ].map(({ step, icon: Icon, title, body }) => (
                <div
                  key={step}
                  className="rounded-2xl border border-ob-line bg-ob-bg/60 p-6 transition-colors hover:border-ob-signal/25"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-6 w-6 text-ob-signal" />
                    <span className="font-mono text-xs text-ob-dim">{step}</span>
                  </div>
                  <h3 className="mt-4 font-display text-base text-ob-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ob-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CONTAINMENT */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">
                  Containment by design
                </p>
                <h2 className="mt-3 font-display text-3xl text-ob-ink sm:text-4xl">
                  Your code never leaves our sandbox. Our bots never leave it either.
                </h2>
                <p className="mt-4 text-ob-muted">
                  Every other testing tool needs a public URL to point at. We don&apos;t. You upload your
                  codebase, we run the entire test inside one air-gapped environment, and destroy it when
                  we&apos;re done. Misuse isn&apos;t prevented by policy — it&apos;s prevented by network topology.
                </p>
                <Link href="/safety" className="mt-6 inline-block">
                  <Button variant="secondary">Read the trust architecture</Button>
                </Link>
              </div>

              <div className="rounded-2xl border border-ob-line bg-ob-surface/40 p-6">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ob-signal">
                  What this rules out
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    'No DDoS-as-a-service',
                    'No metric inflation',
                    'No competitor scraping',
                    'No unauthorized targets',
                    'No leaked customer data',
                    'No untraceable runs',
                  ].map((line) => (
                    <p key={line} className="font-mono text-xs text-ob-muted">
                      <span className="mr-2 text-ob-signal">✓</span>
                      {line}
                    </p>
                  ))}
                </div>
                <p className="mt-6 border-t border-ob-line pt-4 font-mono text-[11px] text-ob-dim">
                  Every run produces a signed audit artifact: commit hash, run ID, persona mix, target
                  fingerprint. Compliance teams can verify after the fact.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* WHO IT'S FOR */}
        <section className="border-t border-ob-line bg-ob-surface/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">Who it&apos;s for</p>
            <h2 className="mt-3 font-display text-3xl text-ob-ink sm:text-4xl">
              Two ways to use Oracle Bot.
            </h2>

            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-ob-line bg-ob-bg/60 p-7">
                <Sparkles className="h-8 w-8 text-ob-signal" />
                <h3 className="mt-4 font-display text-2xl text-ob-ink">For AI builders</h3>
                <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ob-muted">
                  Self-serve · from $29 per run
                </p>
                <p className="mt-4 text-sm leading-relaxed text-ob-muted">
                  You shipped your app with Cursor, Claude, or Lovable. You&apos;ve never run a load test —
                  let alone tested an agent for prompt injections. You don&apos;t want to. Connect your repo,
                  and Oracle Bot handles the rest.
                </p>
                <ul className="mt-5 space-y-2 font-mono text-xs text-ob-muted">
                  <li>→ Connect GitHub. We auto-detect what to test.</li>
                  <li>→ No staging environment required.</li>
                  <li>→ Get an Oracle Report in under an hour.</li>
                </ul>
                <Link href="/app/tests/new" className="mt-6 inline-block">
                  <Button>Start a self-serve run</Button>
                </Link>
              </div>

              <div className="rounded-2xl border border-ob-line bg-ob-bg/60 p-7">
                <ShieldCheck className="h-8 w-8 text-ob-signal" />
                <h3 className="mt-4 font-display text-2xl text-ob-ink">For pre-launch teams</h3>
                <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-ob-muted">
                  Concierge · $10k–$50k engagements
                </p>
                <p className="mt-4 text-sm leading-relaxed text-ob-muted">
                  Trading platforms, fintechs, AI-native startups. Pre-launch teams who need a readiness
                  audit with vertical-specific personas, on-call support, and signed audit artifacts for
                  procurement and compliance.
                </p>
                <ul className="mt-5 space-y-2 font-mono text-xs text-ob-muted">
                  <li>→ Vertical persona libraries (traders, support users, etc.)</li>
                  <li>→ Launch rehearsal scenarios + on-call engineer.</li>
                  <li>→ Signed proof-of-authorized-test PDF.</li>
                </ul>
                <a href="/trading.html" className="mt-6 inline-block">
                  <Button variant="secondary">Talk to us</Button>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">Pricing</p>
            <h2 className="mt-3 font-display text-3xl text-ob-ink sm:text-4xl">
              Transparent. With a hard cap so you&apos;re never surprised.
            </h2>
            <p className="mt-3 max-w-2xl text-ob-muted">
              Each tier is a fixed price for a fixed run. Need more? Overage is{' '}
              <span className="font-mono text-ob-ink">$0.04 per persona-minute</span> — and you can set a
              hard cap so the bill never escapes you.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { n: 'Scout', p: '$29', f: 'Per run', d: '500 bots · 15 min · 1 mode', cta: 'Try it' },
                {
                  n: 'Builder',
                  p: '$149',
                  f: 'Per run',
                  d: '5k bots · 1 hr · all modes',
                  cta: 'Start a run',
                  highlight: true,
                },
                {
                  n: 'Studio',
                  p: '$299',
                  f: 'Per month',
                  d: 'Unlimited runs · 10k bots',
                  cta: 'Subscribe',
                },
                {
                  n: 'Stack',
                  p: '$999',
                  f: 'Per month',
                  d: 'CI integration · custom personas · SSO',
                  cta: 'Subscribe',
                },
                {
                  n: 'Concierge',
                  p: '$10k+',
                  f: 'Engagement',
                  d: 'Pre-launch audit · signed artifacts',
                  cta: 'Talk to us',
                },
              ].map((row) => (
                <div
                  key={row.n}
                  className={`rounded-xl border p-5 ${
                    row.highlight
                      ? 'border-ob-signal/50 bg-ob-signal/[0.04]'
                      : 'border-ob-line bg-ob-surface/50'
                  }`}
                >
                  <p className="font-display text-lg text-ob-ink">{row.n}</p>
                  <p className="mt-2 font-mono text-2xl text-ob-signal">{row.p}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ob-dim">
                    {row.f}
                  </p>
                  <p className="mt-2 text-xs text-ob-muted">{row.d}</p>
                  <Link href="/app/tests/new" className="mt-4 block">
                    <Button variant="secondary" className="w-full" size="sm">
                      {row.cta}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMPARISON */}
        <section className="border-t border-ob-line bg-ob-surface/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ob-signal">
              Why not existing tools
            </p>
            <h2 className="mt-3 font-display text-3xl text-ob-ink sm:text-4xl">
              The category didn&apos;t exist. So we built it.
            </h2>

            <div className="mt-10 overflow-hidden rounded-2xl border border-ob-line">
              <table className="w-full text-left text-sm">
                <thead className="bg-ob-bg/60 font-mono text-[11px] uppercase tracking-[0.14em] text-ob-dim">
                  <tr>
                    <th className="p-4">&nbsp;</th>
                    <th className="p-4">Load testers (k6, Artillery)</th>
                    <th className="p-4">AI eval tools (LangSmith)</th>
                    <th className="p-4 text-ob-signal">Oracle Bot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ob-line text-ob-muted">
                  {[
                    ['Tests websites', 'Yes — endpoints only', 'No', 'Yes — full user flows'],
                    ['Tests AI agents', 'No', 'Yes — offline only', 'Yes — adversarial dialogue'],
                    ['Tests APIs', 'Yes', 'No', 'Yes'],
                    ['Tests full AI stack end-to-end', 'No', 'No', 'Yes — Stack Mode'],
                    [
                      'Provisions the environment',
                      'No (you point at a URL)',
                      'No',
                      'Yes — air-gapped sandbox',
                    ],
                    ['Generates AI fixes', 'No', 'No', 'Yes — one-click PR patches'],
                  ].map(([label, load, evals, ob]) => (
                    <tr key={label} className="bg-ob-bg/40">
                      <td className="p-4 font-mono text-xs text-ob-ink">{label}</td>
                      <td className="p-4 text-sm">{load}</td>
                      <td className="p-4 text-sm">{evals}</td>
                      <td className="p-4 text-sm text-ob-ink">{ob}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <Zap className="mx-auto h-10 w-10 text-ob-signal" />
            <h2 className="mt-6 font-display text-3xl text-ob-ink sm:text-4xl">
              AI built it. AI tests it. AI fixes it. You ship it.
            </h2>
            <p className="mt-4 text-ob-muted">
              Oracle Bot is the only platform that closes the loop — find the bug, propose the patch,
              re-run the test. The first Agent Testing Platform, built for the way software actually
              gets made now.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/app/tests/new">
                <Button size="lg">
                  Run your first test <ArrowRight className="ml-1 h-4 w-4" />
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
