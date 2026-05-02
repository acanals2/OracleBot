/**
 * Oracle Report — aggregation + scoring helpers.
 *
 * The worker produces raw findings + metrics during a run. After the run
 * completes, we compute the readiness score and a structured summary using
 * these helpers, then persist them on the `runs` row.
 *
 * Scoring weights MUST stay in sync with `worker/src/engine/scoring.ts`
 * (the canonical version). The total-score branch below mirrors
 * `computeReadinessScore` exactly: per-severity deduction + a one-time
 * −5 bonus penalty when any critical finding is present.
 */
import type { RunFinding } from './db/schema';

const SEVERITY_PENALTY: Record<RunFinding['severity'], number> = {
  critical: 25,
  high: 12,
  medium: 6,
  low: 2,
  info: 0.5,
};

const CRITICAL_BONUS_PENALTY = 5;

interface ScoreBreakdown {
  total: number; // 0-100
  perMode: { site?: number; agent?: number; api?: number; stack?: number };
  findingsByCategory: Record<string, number>;
  findingsBySeverity: Record<string, number>;
}

/**
 * Compute a readiness score from a list of findings.
 *
 * @param findings  All findings produced during the run.
 * @param mode      The run's primary mode — affects sub-scores.
 */
export function computeReadiness(
  findings: RunFinding[],
  mode: 'site' | 'agent' | 'api' | 'stack',
): ScoreBreakdown {
  const findingsBySeverity: Record<string, number> = {};
  const findingsByCategory: Record<string, number> = {};

  for (const f of findings) {
    findingsBySeverity[f.severity] = (findingsBySeverity[f.severity] ?? 0) + 1;
    findingsByCategory[f.category] = (findingsByCategory[f.category] ?? 0) + 1;
  }

  const total = scoreFindings(findings);

  const perMode: ScoreBreakdown['perMode'] = {};
  if (mode === 'stack') {
    // For Stack mode, also compute sub-scores by category bucket.
    perMode.site = subScore(findings, ['race_condition', 'load_ceiling']);
    perMode.agent = subScore(findings, [
      'prompt_injection',
      'hallucination',
      'jailbreak',
      'system_prompt_leak',
      'off_topic_drift',
    ]);
    perMode.api = subScore(findings, ['auth_gap', 'malformed_input', 'rate_limit_gap']);
    perMode.stack = total;
  } else {
    perMode[mode] = total;
  }

  return { total, perMode, findingsBySeverity, findingsByCategory };
}

/**
 * Mirror of `computeReadinessScore` in worker/src/engine/scoring.ts.
 * Keep these two implementations identical.
 */
function scoreFindings(findings: RunFinding[]): number {
  let score = 100;
  let hasCritical = false;
  for (const f of findings) {
    score -= SEVERITY_PENALTY[f.severity] ?? 0;
    if (f.severity === 'critical') hasCritical = true;
  }
  if (hasCritical) score -= CRITICAL_BONUS_PENALTY;
  return Math.max(0, Math.round(score));
}

function subScore(findings: RunFinding[], categories: string[]): number {
  const subset = findings.filter((f) => categories.includes(f.category));
  return scoreFindings(subset);
}

/**
 * Build the JSON summary that gets stored on `runs.summaryJson` and rendered
 * in the report UI + emails.
 */
export function buildRunSummary(opts: {
  findings: RunFinding[];
  mode: 'site' | 'agent' | 'api' | 'stack';
  durationMinutes: number;
  botCount: number;
}) {
  const score = computeReadiness(opts.findings, opts.mode);
  const top = opts.findings
    .slice()
    .sort((a, b) => SEVERITY_PENALTY[b.severity] - SEVERITY_PENALTY[a.severity])
    .slice(0, 5)
    .map((f) => ({
      id: f.id,
      severity: f.severity,
      title: f.title,
      category: f.category,
    }));

  return {
    readinessScore: score.total,
    perMode: score.perMode,
    findingsCount: opts.findings.length,
    findingsByCategory: score.findingsByCategory,
    findingsBySeverity: score.findingsBySeverity,
    topFindings: top,
    runtime: {
      durationMinutes: opts.durationMinutes,
      botCount: opts.botCount,
      personaMinutes: opts.botCount * opts.durationMinutes,
    },
    generatedAt: new Date().toISOString(),
  };
}
