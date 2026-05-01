import { eq } from 'drizzle-orm';
import { AlertCircle, Check } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { requireSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { subscriptions, usageCredits } from '@/lib/db/schema';
import { PRODUCTS, FREE_RUNS_PER_MONTH, formatPrice } from '@/lib/billing';
import { getEntitlements } from '@/lib/entitlements';
import { CheckoutButton } from './CheckoutButton';

export default async function BillingPage() {
  const session = await requireSession();
  const [activeSubs, credits, entitlements] = await Promise.all([
    db.select().from(subscriptions).where(eq(subscriptions.orgId, session.org.id)),
    db.select().from(usageCredits).where(eq(usageCredits.orgId, session.org.id)),
    getEntitlements(session.org.id),
  ]);

  const activeSub = activeSubs.find((s) => s.status === 'active' || s.status === 'trialing');
  const pastDueSub = activeSubs.find(
    (s) => s.status === 'past_due' || s.status === 'unpaid',
  );
  const totalCredits = credits.reduce((sum, c) => sum + c.creditsRemaining, 0);

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="Account &amp; billing"
          subtitle={`${session.org.name} · transparent pricing, hard caps available per run`}
        />
        <div className="flex-1 space-y-8 p-8">
          {pastDueSub && (
            <div className="flex items-center gap-3 rounded-lg border border-ob-danger/40 bg-ob-danger/10 p-4">
              <AlertCircle className="h-5 w-5 shrink-0 text-ob-danger" />
              <div className="flex-1">
                <p className="font-medium text-ob-danger">Subscription payment failed</p>
                <p className="mt-1 text-sm text-ob-muted">
                  Your {PRODUCTS.find((p) => p.key === pastDueSub.productKey)?.name ?? pastDueSub.productKey} subscription
                  is past due. Runs are blocked until you update your payment method.
                </p>
              </div>
              <form action="/api/billing/portal" method="POST">
                <Button type="submit" variant="secondary" size="sm">
                  Update payment
                </Button>
              </form>
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle>Current plan</CardTitle>
                <p className="mt-1 text-sm text-ob-muted">
                  {activeSub
                    ? `${PRODUCTS.find((p) => p.key === activeSub.productKey)?.name ?? activeSub.productKey} — renews ${activeSub.currentPeriodEnd.toISOString().slice(0, 10)}`
                    : totalCredits > 0
                      ? `Pay-per-run with ${totalCredits} credit${totalCredits === 1 ? '' : 's'} remaining.`
                      : entitlements.freeRunsRemaining > 0
                        ? `Free tier · ${entitlements.freeRunsRemaining} of ${FREE_RUNS_PER_MONTH} runs remaining this month.`
                        : 'Free tier exhausted this month. Buy credits or subscribe to keep running.'}
                </p>
              </div>
              {activeSub && <Badge variant="signal">{activeSub.status}</Badge>}
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              {activeSub ? (
                <form action="/api/billing/portal" method="POST">
                  <Button type="submit" variant="secondary">Manage subscription</Button>
                </form>
              ) : null}
              <div className="flex flex-wrap gap-4 text-xs text-ob-muted">
                <span>
                  Free runs remaining:{' '}
                  <span className="font-mono text-ob-ink">
                    {entitlements.freeRunsRemaining}/{FREE_RUNS_PER_MONTH}
                  </span>
                </span>
                <span>
                  Per-run credits:{' '}
                  <span className="font-mono text-ob-ink">{totalCredits}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Per-run credits</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {PRODUCTS.filter((p) => p.type === 'credit').map((p) => (
                  <div
                    key={p.key}
                    className="flex items-start justify-between gap-4 rounded-lg border border-ob-line bg-ob-surface/30 p-4"
                  >
                    <div>
                      <p className="font-display text-lg text-ob-ink">{p.name}</p>
                      <p className="text-xs text-ob-muted">{p.summary}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-ob-signal">{formatPrice(p.priceCents)}</p>
                      <CheckoutButton productKey={p.key} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Subscriptions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {PRODUCTS.filter((p) => p.type === 'subscription').map((p) => (
                  <div
                    key={p.key}
                    className="flex items-start justify-between gap-4 rounded-lg border border-ob-line bg-ob-surface/30 p-4"
                  >
                    <div>
                      <p className="font-display text-lg text-ob-ink">{p.name}</p>
                      <p className="text-xs text-ob-muted">{p.summary}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-ob-signal">{formatPrice(p.priceCents)}/mo</p>
                      <CheckoutButton productKey={p.key} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Concierge engagements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-ob-muted">
              <p>
                Pre-launch fintech, exchanges, AI-native startups: $10k–$50k for a hands-on readiness
                audit with vertical-specific personas, on-call support during your launch window, and a
                signed proof-of-authorized-test PDF for procurement.
              </p>
              <ul className="space-y-2">
                {[
                  'Vertical persona libraries (traders, support users, etc.)',
                  'Launch rehearsal scenarios + on-call engineer',
                  'Compliance artifacts: commit hash + run ledger + signed PDF',
                ].map((x) => (
                  <li key={x} className="flex gap-2">
                    <Check className="h-4 w-4 shrink-0 text-ob-signal" />
                    {x}
                  </li>
                ))}
              </ul>
              <a href="mailto:concierge@oraclebot.net" className="inline-block">
                <Button variant="secondary">concierge@oraclebot.net</Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
