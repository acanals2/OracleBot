import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingNav } from '@/components/layout/MarketingNav';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Box, Fingerprint, Globe2, Network, Scale, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Trust & containment',
  description:
    'Oracle Bot tests your code in an air-gapped sandbox. Misuse is prevented by network topology, not by policy.',
};

const PILLARS = [
  {
    icon: Network,
    title: 'Containment by network topology',
    body: 'Every run executes in an isolated sandbox we provision. The sandbox has no public IP, no internet egress, and no route to any system you don\'t own. Misuse is technically impossible — not just contractually prohibited.',
  },
  {
    icon: Globe2,
    title: 'Authorized targets only',
    body: 'You connect a target via GitHub OAuth, a verified Docker image, or a DNS-verified URL. Every run is bound to a commit hash, image digest, or domain you proved you control.',
  },
  {
    icon: Box,
    title: 'Air-gapped execution',
    body: 'Bots, application code, and dependencies all run inside the same isolated network namespace. The sandbox is destroyed when the run ends. No persistent state. No data leaves.',
  },
  {
    icon: Shield,
    title: 'Anti-abuse controls',
    body: 'Hard caps on persona-minutes per run. Rate limits per organization. Manual review for runs above 30k personas. Any anomaly auto-pauses the run.',
  },
  {
    icon: Fingerprint,
    title: 'Signed audit artifacts',
    body: 'Every run produces a tamper-evident receipt: commit hash, run ID, persona mix, target fingerprint, timestamps. Compliance teams can verify after the fact.',
  },
  {
    icon: Scale,
    title: 'Legal posture',
    body: 'Our terms forbid unauthorized testing. Identity is verified at signup. Runs are attributable to a real person on a real billing account. We cooperate with providers and law enforcement on misuse reports.',
  },
];

export default function SafetyPage() {
  return (
    <div className="min-h-screen bg-ob-bg">
      <MarketingNav />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.25em] text-ob-signal">
          Trust &amp; containment
        </p>
        <h1 className="mt-4 font-display text-4xl text-ob-ink">Containment is the product.</h1>
        <p className="mt-4 text-lg leading-relaxed text-ob-muted">
          Oracle Bot is the only testing platform where misuse is prevented by network topology — not
          by policy or trust. Your code never leaves our sandbox. Our bots never leave it either.
        </p>

        <div className="mt-12 space-y-4">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardContent className="flex gap-4 p-6">
                <Icon className="mt-1 h-6 w-6 shrink-0 text-ob-signal" />
                <div>
                  <h2 className="font-display text-xl text-ob-ink">{title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-ob-muted">{body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link href="/app/tests/new">
            <Button>Start a run</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary">Back home</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
