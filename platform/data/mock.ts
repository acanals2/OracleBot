import type { PricingTier, StressTest, TestMetrics } from '../types/api';

export const MOCK_TIERS: PricingTier[] = [
  {
    id: 'starter',
    name: 'Starter',
    maxBots: 1000,
    priceUsd: 49,
    durationMinutes: 15,
    reportDepth: 'summary',
    features: ['1 parallel scenario', 'Email summary', '7-day report history'],
  },
  {
    id: 'growth',
    name: 'Growth',
    maxBots: 5000,
    priceUsd: 199,
    durationMinutes: 45,
    reportDepth: 'standard',
    features: ['3 scenarios / run', 'Slack alerts', 'Endpoint breakdown', '30-day history'],
  },
  {
    id: 'scale',
    name: 'Scale',
    maxBots: 10000,
    priceUsd: 499,
    durationMinutes: 120,
    reportDepth: 'deep',
    features: ['Spike + sustained profiles', 'Raw export (JSON)', 'Priority queue', '90-day history'],
  },
  {
    id: 'mega',
    name: 'High volume',
    maxBots: 30000,
    priceUsd: 1299,
    durationMinutes: 180,
    reportDepth: 'deep',
    features: ['Human approval for 30k+', 'Dedicated slack', 'Solutions engineer review call'],
  },
];

export const MOCK_TESTS: StressTest[] = [
  {
    id: 't_8f2a',
    name: 'Pre-launch checkout spike',
    targetUrl: 'https://staging.acme.app',
    botCount: 5000,
    testTypes: ['Traffic spike', 'Checkout flow'],
    status: 'completed',
    startedAt: '2026-04-26T14:00:00Z',
    completedAt: '2026-04-26T14:42:00Z',
  },
  {
    id: 't_9c11',
    name: 'API baseline — auth service',
    targetUrl: 'https://api.staging.acme.app',
    botCount: 1000,
    testTypes: ['API stress', 'Login / signup'],
    status: 'running',
    startedAt: '2026-04-28T10:05:00Z',
  },
  {
    id: 't_7bbd',
    name: 'Landing page burst',
    targetUrl: 'https://preview.acme.io',
    botCount: 10000,
    testTypes: ['Repeated requests', 'High-traffic spike'],
    status: 'queued',
  },
];

export const MOCK_METRICS: TestMetrics = {
  avgResponseMs: 142,
  p95ResponseMs: 428,
  errorRate: 0.012,
  timeoutRate: 0.003,
  rps: 1840,
  requestsTotal: 462_100,
  failedRequests: 5545,
};

export const CHART_SERIES = Array.from({ length: 24 }, (_, i) => ({
  t: `${i}:00`,
  ms: 80 + Math.sin(i / 2) * 40 + (i > 18 ? 120 + i * 8 : 0),
  errors: i > 19 ? 2 + (i % 4) : i % 7 === 0 ? 1 : 0,
}));
