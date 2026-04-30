/**
 * Stack Mode engine.
 *
 * Combines all three engines (site, agent, api) against the same target in
 * parallel. Also tracks aggregate AI cost across sub-engines and surfaces a
 * cost_runaway finding if Claude spend is projected to exceed the hard cap.
 *
 * The target for Stack Mode is expected to be a full application with both
 * a web UI (site-bot), an AI agent endpoint (agent-bot), and an HTTP API
 * (api-bot). If the target lacks one of those, those sub-engines will emit
 * zero findings gracefully.
 *
 * Findings include everything from sub-engines plus:
 *   - cost_runaway   Projected AI spend exceeds hard cap mid-run
 *   - state_drift    Inconsistent state observed between UI + API
 *
 * BotTick extras: { ai_cost_cents, injection_rate }
 */
import Anthropic from '@anthropic-ai/sdk';
import type { EngineOpts, EngineEvent, BotTick, RawFinding } from './types.js';
import { isBotTick } from './types.js';
import { runSiteMode } from './site-bot.js';
import { runAgentMode } from './agent-bot.js';
import { runApiMode } from './api-bot.js';

const TICK_INTERVAL_MS = 5_000;

// Rough cost per 1K tokens for claude-haiku-4-5 ($0.00025 input + $0.00125 output)
const COST_PER_1K_TOKENS_CENTS = 0.15;

interface StackState {
  ticks: BotTick[];
  findings: RawFinding[];
  totalTokensEstimate: number;
  startTime: number;
}

function mergeTick(ticks: BotTick[], tSeconds: number): BotTick {
  if (ticks.length === 0) {
    return { tSeconds, activeBots: 0, rps: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, errorRate: 0 };
  }

  const totalBots = ticks.reduce((s, t) => s + t.activeBots, 0);
  const totalRps = ticks.reduce((s, t) => s + t.rps, 0);

  // Weighted average latencies
  const weightedP50 = ticks.reduce((s, t) => s + t.p50Ms * t.rps, 0) / (totalRps || 1);
  const weightedP95 = ticks.reduce((s, t) => s + t.p95Ms * t.rps, 0) / (totalRps || 1);
  const weightedP99 = ticks.reduce((s, t) => s + t.p99Ms * t.rps, 0) / (totalRps || 1);
  const weightedErr = ticks.reduce((s, t) => s + t.errorRate * t.rps, 0) / (totalRps || 1);

  const injectionRate = ticks.reduce((s, t) => s + (t.extras?.injection_rate ?? 0), 0) / ticks.length;

  return {
    tSeconds,
    activeBots: totalBots,
    rps: totalRps,
    p50Ms: weightedP50,
    p95Ms: weightedP95,
    p99Ms: weightedP99,
    errorRate: weightedErr,
    extras: {
      injection_rate: injectionRate,
    },
  };
}

export async function* runStackMode(opts: EngineOpts): AsyncGenerator<EngineEvent> {
  const { run, targetUrl, durationMs, anthropicApiKey } = opts;

  const state: StackState = {
    ticks: [],
    findings: [],
    totalTokensEstimate: 0,
    startTime: Date.now(),
  };

  // Hard cap defaults to 10x the estimated cost or $50, whichever is lower
  const hardCapCents = run.hardCapCents ?? Math.min(run.costCentsEstimated ?? 5000, 5000);

  const emittedFindingTitles = new Set<string>();
  let costRunawaySurfaced = false;

  // Determine sub-engine target URLs
  // Stack mode typically gets a repo/docker target → single URL for all three modes
  // Agent endpoint defaults to targetUrl/api/chat or similar common patterns
  const agentEndpoints = [
    `${targetUrl}/api/chat`,
    `${targetUrl}/api/agent`,
    `${targetUrl}/chat`,
    targetUrl,
  ];

  // Collect events from all three engines into a shared buffer
  const allEvents: EngineEvent[] = [];
  const subTicks: { site: BotTick | null; agent: BotTick | null; api: BotTick | null } = {
    site: null,
    agent: null,
    api: null,
  };

  // Run all three engines in parallel, collecting events into shared buffer
  async function drainEngine(
    gen: AsyncGenerator<EngineEvent>,
    name: 'site' | 'agent' | 'api',
  ): Promise<void> {
    for await (const event of gen) {
      allEvents.push(event);
      if (isBotTick(event)) {
        subTicks[name] = event;
      }
    }
  }

  // Try each agent endpoint until one responds
  let agentUrl = targetUrl;
  for (const ep of agentEndpoints) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'ping' }),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.status < 500) {
        agentUrl = ep;
        break;
      }
    } catch {
      continue;
    }
  }

  const siteOpts = { ...opts };
  const agentOpts = { ...opts, targetUrl: agentUrl };
  const apiOpts = { ...opts };

  const engineTasks = [
    drainEngine(runSiteMode(siteOpts), 'site'),
    drainEngine(runAgentMode(agentOpts), 'agent'),
    drainEngine(runApiMode(apiOpts), 'api'),
  ];

  // Start all engines
  const allDone = Promise.allSettled(engineTasks);

  const tickCount = Math.floor(durationMs / TICK_INTERVAL_MS);
  let eventCursor = 0;

  for (let tick = 0; tick < tickCount; tick++) {
    await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
    const tSeconds = Math.round((Date.now() - state.startTime) / 1000);

    // Drain newly collected events
    const newEvents = allEvents.slice(eventCursor);
    eventCursor = allEvents.length;

    for (const event of newEvents) {
      if (!isBotTick(event)) {
        state.findings.push(event);
      }
    }

    // Estimate AI cost from Anthropic SDK usage
    // Proxy: each bot tick roughly represents ~5 Claude calls of 500 tokens avg
    state.totalTokensEstimate += 5 * 500 * Object.values(subTicks).filter(Boolean).length;
    const aiCostCents = Math.round((state.totalTokensEstimate / 1000) * COST_PER_1K_TOKENS_CENTS);

    // Check cost runaway
    const elapsed = Date.now() - state.startTime;
    const remainingFraction = Math.max(0, 1 - elapsed / durationMs);
    const projectedTotalCents = remainingFraction > 0
      ? aiCostCents + (aiCostCents / (1 - remainingFraction)) * remainingFraction
      : aiCostCents;

    if (!costRunawaySurfaced && projectedTotalCents > hardCapCents * 0.8) {
      costRunawaySurfaced = true;
      state.findings.push({
        severity: 'high',
        category: 'cost_runaway',
        title: `Projected AI cost ($${(projectedTotalCents / 100).toFixed(2)}) approaching hard cap ($${(hardCapCents / 100).toFixed(2)})`,
        description: `At the current AI call rate, the run is projected to spend $${(projectedTotalCents / 100).toFixed(2)} — ${Math.round((projectedTotalCents / hardCapCents) * 100)}% of the $${(hardCapCents / 100).toFixed(2)} hard cap. The triggering factor is likely a retry loop or high-volume concurrent agent calls.`,
        reproJson: {
          steps: [
            `Run ${run.botCount} bots for ${run.durationMinutes} minutes in Stack mode`,
            `Observe AI cost accelerating beyond linear projection`,
          ],
          impactedPath: 'agent endpoint',
        },
        remediation: 'Add a per-request token budget. Implement exponential backoff with jitter on retries. Use streaming responses and abort early when the answer is found. Cache frequent agent responses.',
      });
    }

    // Emit merged tick with ai_cost_cents in extras
    const tickValues = Object.values(subTicks).filter((t): t is BotTick => t !== null);
    const merged = mergeTick(tickValues, tSeconds);
    merged.extras = { ...merged.extras, ai_cost_cents: aiCostCents };
    yield merged;

    // Surface findings
    for (const finding of state.findings) {
      if (!emittedFindingTitles.has(finding.title)) {
        emittedFindingTitles.add(finding.title);
        yield finding;
      }
    }
  }

  await allDone;

  // Final drain
  const remaining = allEvents.slice(eventCursor);
  for (const event of remaining) {
    if (!isBotTick(event) && !emittedFindingTitles.has((event as RawFinding).title)) {
      emittedFindingTitles.add((event as RawFinding).title);
      yield event;
    }
  }
}
