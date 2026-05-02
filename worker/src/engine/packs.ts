/**
 * Probe pack registry — worker side.
 *
 * Packs are the externally-facing grouping of probes. Modes (site/agent/api/stack)
 * remain the execution boundary — each engine knows how to provision a sandbox and
 * drive bots. Packs are a higher-level abstraction that says "run THIS subset of
 * probes within whatever engines they need."
 *
 * Today (Phase 10a) this file declares pack metadata only. The probe-extraction
 * refactor (10b) will split engine logic into individual probes that register
 * themselves here with a `runProbe` async generator.
 *
 * IMPORTANT: keep pack ids + metadata in sync with `platform/data/packs.ts`.
 * The platform side reads from that mirror for run-creation validation and UI.
 */
import type { RawFinding } from './types.js';

// ────────────────────────────────────────────────────────────────────────────
// Pack identity
// ────────────────────────────────────────────────────────────────────────────

export const PACK_IDS = [
  'web_classics',
  'ai_built_apps',
  'llm_endpoints',
  'mcp_server',
  'agent_runtime',
] as const;

export type PackId = (typeof PACK_IDS)[number];

/** Engines a probe can run inside. */
export type ProbeEngine = 'site' | 'agent' | 'api';

// ────────────────────────────────────────────────────────────────────────────
// Probe definitions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Context handed to a probe at run time. The exact shape will grow as we
 * extract probes out of the four engine files. Today this is intentionally
 * minimal — probes don't run from this registry yet.
 */
export interface ProbeContext {
  targetUrl: string;
  durationMs: number;
  anthropicApiKey: string;
  // Engine-specific helpers (browser page, http client, etc.) will be added
  // when probes are extracted from site-bot/agent-bot/api-bot in Phase 10b.
}

/**
 * A single probe — the unit of detection logic that emits one or more
 * RawFindings. Probes are grouped into packs and routed to engines.
 *
 * `runProbe` is optional during Phase 10a because today's probes are still
 * inline in engine files. It becomes required after Phase 10b.
 */
export interface ProbeDefinition {
  id: string;
  pack: PackId;
  engine: ProbeEngine;
  category: RawFinding['category'];
  defaultSeverity: RawFinding['severity'];
  title: string;
  description: string;
  runProbe?: (ctx: ProbeContext) => AsyncGenerator<RawFinding>;
}

export interface PackDefinition {
  id: PackId;
  label: string;
  description: string;
  /** Probe IDs that belong to this pack (string list — probes register separately). */
  probeIds: string[];
  /** Which engines must run for this pack to fully exercise its probes. */
  requiredEngines: ReadonlySet<ProbeEngine>;
  /** True when this pack is implemented end-to-end and ready to ship. */
  available: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Pack catalog
// ────────────────────────────────────────────────────────────────────────────

/**
 * web_classics — the existing Phase 5 probes, regrouped under a pack name.
 * Probe IDs here mirror the inline detections in site-bot/agent-bot/api-bot.
 * They are placeholders until Phase 10b extracts each detection into its own
 * probe module.
 */
const WEB_CLASSICS_PROBE_IDS = [
  // site-bot
  'site_console_error',
  'site_form_auth_gap',
  'site_concurrent_submit_race',
  'site_response_latency',
  'site_form_500_on_adversarial',
  // agent-bot
  'agent_system_prompt_leak',
  'agent_jailbreak',
  'agent_prompt_injection',
  'agent_hallucination',
  'agent_off_topic_drift',
  'agent_no_rate_limit',
  // api-bot
  'api_no_rate_limit',
  'api_unauthenticated_500',
  'api_malformed_input_500',
  'api_cors_or_security_headers',
];

/**
 * ai_built_apps — Phase 11. Targets output from Lovable / v0 / Bolt /
 * Cursor / Replit Agent. Many of these mirror failure patterns those
 * platforms generate by default.
 *
 * Pass A (shipped): five read-only probes — secrets, supabase key,
 * error-page leak, debug endpoints, CORS.
 * Pass B (in progress): missing_rls_on_public_tables (live).
 * Pass B (remaining): firebase_rules_open, unvalidated_redirect,
 * missing_csrf_protection, client_side_auth_only, missing_rate_limit_on_auth,
 * dependency_with_known_cve.
 */
const AI_BUILT_APPS_PROBE_IDS = [
  'hardcoded_secret_in_bundle',
  'supabase_anon_key_exposed',
  'missing_rls_on_public_tables',
  'default_error_page_leak',
  'exposed_debug_endpoints',
  'insecure_cors_on_api_routes',
];

/**
 * llm_endpoints — Phase 13. Targets HTTP endpoints wrapping an LLM.
 */
const LLM_ENDPOINTS_PROBE_IDS = [
  'system_prompt_extraction',
  'prompt_injection_via_user_content',
  'pii_echo_in_response',
  'jailbreak_bypass',
  'hallucination_on_factual_query',
  'missing_output_length_cap',
  'no_rate_limit_on_llm_endpoint',
  'cost_amplification_attack',
  'unsafe_tool_call_execution',
  'response_format_violation',
];

/**
 * mcp_server — Phase 13. Targets MCP server endpoints. HTTP/SSE only;
 * stdio transport is out of scope until Phase 20+.
 */
const MCP_SERVER_PROBE_IDS = [
  'tool_description_injection',
  'credential_leak_in_tool_desc',
  'tool_name_collision',
  'unbounded_resource_list',
  'missing_auth_on_mcp_transport',
  'tool_invocation_without_confirmation',
  'cross_resource_access',
  'schema_violation_on_tool_input',
  'capability_escalation_via_sampling',
  'logging_sensitive_data',
];

/**
 * agent_runtime — Phase 20. Multi-turn adversarial, tool-use safety,
 * memory poisoning. Defined here as a placeholder so the type system
 * knows about the pack id.
 */
const AGENT_RUNTIME_PROBE_IDS: string[] = [];

export const PACKS: Record<PackId, PackDefinition> = {
  web_classics: {
    id: 'web_classics',
    label: 'Web Classics',
    description:
      'The original Oracle Bot probe set: race conditions, auth gaps, prompt injection, and the rest of the Phase 5 catalog. Implicit default for any run created before packs existed.',
    probeIds: WEB_CLASSICS_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['site', 'agent', 'api']),
    available: true,
  },
  ai_built_apps: {
    id: 'ai_built_apps',
    label: 'AI-Built Apps',
    description:
      'Failure modes specific to apps scaffolded by Lovable, v0, Bolt, Cursor, or Replit Agent — exposed Supabase keys, hardcoded secrets, leaked stack traces on error, dev/debug endpoints in production, permissive CORS.',
    probeIds: AI_BUILT_APPS_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['site']),
    available: true,
  },
  llm_endpoints: {
    id: 'llm_endpoints',
    label: 'LLM Endpoints',
    description:
      'HTTP endpoints that wrap an LLM. Probes for prompt injection via user content, system-prompt extraction, PII echo, cost amplification, and unsafe tool calls.',
    probeIds: LLM_ENDPOINTS_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['agent', 'api']),
    available: false,
  },
  mcp_server: {
    id: 'mcp_server',
    label: 'MCP Server',
    description:
      'Model Context Protocol servers exposed over HTTP or SSE. Probes for tool poisoning, credential leakage in tool descriptions, capability escalation, and missing transport auth.',
    probeIds: MCP_SERVER_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['api']),
    available: false,
  },
  agent_runtime: {
    id: 'agent_runtime',
    label: 'Agent Runtime',
    description:
      'Long-horizon adversarial probes for production AI agents: multi-turn jailbreak escalation, tool-use safety boundaries, and memory poisoning.',
    probeIds: AGENT_RUNTIME_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['agent']),
    available: false,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Probe registry
// ────────────────────────────────────────────────────────────────────────────

/**
 * Probes register themselves here as they are extracted out of engine files.
 * During Phase 10a this map is empty; engines still detect inline. Phase 10b
 * begins populating this with one entry per existing detection.
 */
const PROBE_REGISTRY = new Map<string, ProbeDefinition>();

/** Register a probe. Throws on duplicate id to catch wiring mistakes early. */
export function registerProbe(probe: ProbeDefinition): void {
  if (PROBE_REGISTRY.has(probe.id)) {
    throw new Error(`Probe "${probe.id}" already registered.`);
  }
  PROBE_REGISTRY.set(probe.id, probe);
}

export function getProbe(id: string): ProbeDefinition | undefined {
  return PROBE_REGISTRY.get(id);
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers — pack ↔ engine ↔ mode mapping
// ────────────────────────────────────────────────────────────────────────────

/** Type guard: is the given string a known pack id? */
export function isPackId(value: string): value is PackId {
  return (PACK_IDS as readonly string[]).includes(value);
}

/** All engines required by the union of the given packs. */
export function unionRequiredEngines(packIds: PackId[]): Set<ProbeEngine> {
  const out = new Set<ProbeEngine>();
  for (const id of packIds) {
    for (const engine of PACKS[id].requiredEngines) out.add(engine);
  }
  return out;
}

/**
 * Pick a primary mode for a run row given the union of required engines.
 * Multi-engine packs map to 'stack'; single-engine packs map to that engine.
 *
 * Used to keep the existing `runs.mode` column populated even when the user
 * selected packs instead of a mode.
 */
export function modeForPacks(packIds: PackId[]): 'site' | 'agent' | 'api' | 'stack' {
  const engines = unionRequiredEngines(packIds);
  if (engines.size > 1) return 'stack';
  if (engines.has('site')) return 'site';
  if (engines.has('agent')) return 'agent';
  if (engines.has('api')) return 'api';
  // Empty pack list shouldn't reach here, but fall back to site.
  return 'site';
}

/**
 * Backward compatibility: when a run was created with a `mode` and no packs,
 * map the mode to the implicit pack(s) it represents. Today every legacy
 * mode maps to web_classics — that pack contains every existing probe.
 */
export function packsForLegacyMode(_mode: 'site' | 'agent' | 'api' | 'stack'): PackId[] {
  return ['web_classics'];
}
