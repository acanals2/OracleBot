import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PricingTier } from '@/types/api';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';

export function PricingTierCard({
  tier,
  selected,
  onSelect,
}: {
  tier: PricingTier;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      className={cn(
        'transition-all hover:border-ob-signal/30',
        selected && 'border-ob-signal/60 ring-1 ring-ob-signal/40 shadow-glow'
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge variant="muted">{tier.maxBots.toLocaleString()} bots</Badge>
            <h4 className="mt-3 font-display text-xl text-ob-ink">{tier.name}</h4>
            <p className="mt-1 font-mono text-2xl font-semibold text-ob-signal">
              ${tier.priceUsd}
              <span className="text-sm font-normal text-ob-muted"> / run</span>
            </p>
            <p className="mt-1 text-xs text-ob-muted">
              Up to {tier.durationMinutes} min · {tier.reportDepth} report
            </p>
          </div>
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border',
              selected ? 'border-ob-signal bg-ob-signal/15 text-ob-signal' : 'border-ob-line text-ob-dim'
            )}
          >
            {selected && <Check className="h-4 w-4" />}
          </div>
        </div>
        <ul className="mt-5 space-y-2 border-t border-ob-line pt-5">
          {tier.features.map((f) => (
            <li key={f} className="flex gap-2 text-sm text-ob-muted">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ob-signal" />
              {f}
            </li>
          ))}
        </ul>
        <Button
          variant={selected ? 'primary' : 'secondary'}
          className="mt-6 w-full"
          size="sm"
          type="button"
          onClick={onSelect}
        >
          {selected ? 'Selected' : 'Select tier'}
        </Button>
      </CardContent>
    </Card>
  );
}
