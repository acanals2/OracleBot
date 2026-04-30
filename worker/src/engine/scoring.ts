/**
 * Readiness score computation.
 *
 * Score starts at 100 and deducts per finding severity. An additional
 * penalty applies if any critical findings were found.
 *
 *   critical  −25 (+ −5 bonus penalty)
 *   high      −12
 *   medium    −6
 *   low       −2
 *   info      −0.5
 *
 * Result is floored at 0 and rounded to the nearest integer.
 */
import type { RawFinding } from './types.js';

const DEDUCTIONS: Record<RawFinding['severity'], number> = {
  critical: 25,
  high: 12,
  medium: 6,
  low: 2,
  info: 0.5,
};

export function computeReadinessScore(findings: RawFinding[]): number {
  let score = 100;
  let hasCritical = false;

  for (const f of findings) {
    score -= DEDUCTIONS[f.severity] ?? 0;
    if (f.severity === 'critical') hasCritical = true;
  }

  // Extra penalty if any critical findings — doubles the signal for the worst category
  if (hasCritical) score -= 5;

  return Math.max(0, Math.round(score));
}
