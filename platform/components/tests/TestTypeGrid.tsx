'use client';

import {
  Activity,
  BarChart3,
  Globe,
  KeyRound,
  Layers,
  Shield,
  ShoppingCart,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPES = [
  {
    id: 'normal',
    title: 'Normal user simulation',
    desc: 'Mixed navigation, reads, and light writes at human-like pacing.',
    icon: Globe,
  },
  {
    id: 'spike',
    title: 'High-traffic spike',
    desc: 'Sudden burst to mimic campaign launches or viral moments.',
    icon: Zap,
  },
  {
    id: 'repeat',
    title: 'Repeated requests',
    desc: 'Hammer critical paths with controlled retry / backoff patterns.',
    icon: Layers,
  },
  {
    id: 'auth',
    title: 'Login / signup flow',
    desc: 'Session cookies, CSRF, rate limits, and duplicate signups.',
    icon: KeyRound,
  },
  {
    id: 'checkout',
    title: 'Checkout & forms',
    desc: 'Multi-step flows, inventory contention, payment webhooks (sandbox).',
    icon: ShoppingCart,
  },
  {
    id: 'bot-resist',
    title: 'Bot-resistance check',
    desc: 'Evaluate WAF / challenge paths without bypassing CAPTCHA (staging).',
    icon: Shield,
  },
  {
    id: 'api',
    title: 'API endpoint stress',
    desc: 'Per-route concurrency, payload sizes, and auth header pressure.',
    icon: BarChart3,
  },
  {
    id: 'mixed',
    title: 'Custom mix',
    desc: 'Combine profiles — e.g. 70% read + 20% write + 10% auth.',
    icon: Activity,
  },
] as const;

export function TestTypeGrid({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TYPES.map(({ id, title, desc, icon: Icon }) => {
        const active = selected.has(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => onToggle(id)}
            className={cn(
              'flex gap-4 rounded-xl border p-4 text-left transition-all hover:border-ob-signal/25',
              active
                ? 'border-ob-signal/50 bg-ob-signal/5 ring-1 ring-ob-signal/30'
                : 'border-ob-line bg-ob-surface/40'
            )}
          >
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border',
                active ? 'border-ob-signal/40 bg-ob-signal/10 text-ob-signal' : 'border-ob-line text-ob-muted'
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-ob-ink">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ob-muted">{desc}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
