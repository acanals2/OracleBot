import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';

export function ReportSummary() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Executive summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed text-ob-muted">
          <p>
            Your staging stack handled sustained load well until the{' '}
            <span className="text-ob-ink">18:00–19:00 UTC</span> spike window. Checkout API p95 latency crossed{' '}
            <span className="font-mono text-ob-warn">800ms</span> and error rate exceeded{' '}
            <span className="font-mono text-ob-warn">2%</span> for ~6 minutes — correlated with inventory service lock
            contention.
          </p>
          <p>
            Static assets and edge cache stayed healthy. The primary risk for launch is{' '}
            <strong className="text-ob-ink">payment callback retries</strong> under parallel cart checkouts.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Health at a glance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-2 text-ob-signal">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>CDN &amp; edge: stable p95</span>
          </div>
          <div className="flex items-start gap-2 text-ob-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Checkout API: degraded during spike</span>
          </div>
          <div className="flex items-start gap-2 text-ob-signal">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Auth service: within SLO</span>
          </div>
          <div className="flex items-start gap-2 text-ob-muted">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ob-signal" />
            <span>Add idempotent webhook handler + queue drain metric before launch.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
