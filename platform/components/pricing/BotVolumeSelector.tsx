'use client';

import type { PricingTier } from '@/types/api';
import { MOCK_TIERS } from '@/data/mock';
import { PricingTierCard } from './PricingTierCard';

export function BotVolumeSelector({
  value,
  onChange,
}: {
  value: PricingTier;
  onChange: (t: PricingTier) => void;
}) {
  return (
    <div>
      <p className="text-sm text-ob-muted">
        Choose simulated concurrency. Higher tiers include deeper reports and longer windows. 30k+ runs require
        manual approval (anti-abuse).
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MOCK_TIERS.map((t) => (
          <PricingTierCard key={t.id} tier={t} selected={value.id === t.id} onSelect={() => onChange(t)} />
        ))}
      </div>
    </div>
  );
}
