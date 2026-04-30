/** Placeholder shapes for future API integration */

export type TestStatus = 'draft' | 'queued' | 'running' | 'completed' | 'failed';

export interface StressTest {
  id: string;
  name: string;
  targetUrl: string;
  botCount: number;
  testTypes: string[];
  status: TestStatus;
  startedAt?: string;
  completedAt?: string;
}

export interface TestMetrics {
  avgResponseMs: number;
  p95ResponseMs: number;
  errorRate: number;
  timeoutRate: number;
  rps: number;
  requestsTotal: number;
  failedRequests: number;
}

export interface PricingTier {
  id: string;
  name: string;
  maxBots: number;
  priceUsd: number;
  durationMinutes: number;
  reportDepth: 'summary' | 'standard' | 'deep';
  features: string[];
}
