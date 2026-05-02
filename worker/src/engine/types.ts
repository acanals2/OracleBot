/**
 * Shared types for the Oracle Bot engine layer.
 *
 * Every engine module (site-bot, agent-bot, api-bot, stack-bot) receives
 * EngineOpts and yields an async stream of EngineEvents. The run processor
 * consumes that stream and routes each event to recordMetric / recordFinding.
 */
import type { getRun } from '../run-state.js';

export type Run = NonNullable<Awaited<ReturnType<typeof getRun>>>;

/** One time-series sample emitted by a running engine. */
export interface BotTick {
  tSeconds: number;
  activeBots: number;
  rps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  extras?: Record<string, number>;
}

/**
 * A security / reliability finding emitted by an engine.
 * Matches Omit<RunFinding, 'id' | 'createdAt' | 'runId'>.
 */
export interface RawFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category:
    | 'race_condition'
    | 'load_ceiling'
    | 'auth_gap'
    | 'malformed_input'
    | 'rate_limit_gap'
    | 'prompt_injection'
    | 'hallucination'
    | 'jailbreak'
    | 'system_prompt_leak'
    | 'off_topic_drift'
    | 'integration_bug'
    | 'cost_runaway'
    | 'latency_cascade'
    | 'state_drift'
    | 'other'
    // Phase 10 — added for AI-built / LLM / MCP probe packs.
    | 'exposed_secret'
    | 'missing_rls'
    | 'client_key_leak'
    | 'tool_poisoning'
    | 'pii_echo'
    | 'schema_violation'
    | 'capability_escalation'
    | 'credential_in_tool_desc';
  /**
   * Probe id from `worker/src/engine/packs.ts` PROBE_REGISTRY. Optional during
   * the Phase 10a→10b transition; engines that haven't been tagged yet emit
   * findings without one. Once an engine is fully tagged, every emission
   * carries its probe id and the platform can group findings by pack.
   */
  probeId?: string;
  title: string;
  description: string;
  reproJson?: {
    steps?: string[];
    impactedPath?: string;
    affectedPersonas?: string[];
    transcript?: { role: 'user' | 'agent'; content: string }[];
    [k: string]: unknown;
  } | null;
  remediation?: string | null;
  fixPullRequestUrl?: string | null;
}

export type EngineEvent = BotTick | RawFinding;

/** Type guard: discriminate BotTick from RawFinding. */
export function isBotTick(event: EngineEvent): event is BotTick {
  return 'tSeconds' in event && 'rps' in event;
}

/** A live or provisioned sandbox environment the engine runs bots against. */
export interface SandboxHandle {
  /** The public-facing URL the bots should hit. */
  targetUrl: string;
  /** Called after the engine finishes; releases sandbox resources. */
  stop(): Promise<void>;
}

/** Input passed to every engine run function. */
export interface EngineOpts {
  run: Run;
  targetUrl: string;
  /** Total run wall-clock duration in ms. */
  durationMs: number;
  /** Anthropic API key — passed through so engines can call Claude. */
  anthropicApiKey: string;
}

/** Shared engine function signature. */
export type EngineRunner = (opts: EngineOpts) => AsyncGenerator<EngineEvent>;
