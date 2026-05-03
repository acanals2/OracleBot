/**
 * Probe pack registry — platform side.
 *
 * Mirror of `worker/src/engine/packs.ts`. The platform reads from this file
 * for run-creation validation, the run wizard pack picker, and findings
 * display. Probe execution lives entirely in the worker.
 *
 * IMPORTANT: keep pack ids + metadata in sync with the worker copy. This is
 * the same duplication pattern used for `platform/lib/db/schema.ts` ↔
 * `worker/src/schema.ts`.
 */
import type { LucideIcon } from 'lucide-react';
import { Globe, Layers, MessageSquare, Sparkles, Terminal, Wrench } from 'lucide-react';

export const PACK_IDS = [
  'web_classics',
  'ai_built_apps',
  'llm_endpoints',
  'mcp_server',
  'agent_runtime',
] as const;

export type PackId = (typeof PACK_IDS)[number];

export type ProbeEngine = 'site' | 'agent' | 'api';

export interface PackDefinition {
  id: PackId;
  label: string;
  /** Short tagline shown on the wizard card. */
  tagline: string;
  /** Long-form description shown on the pack detail / hover panel. */
  description: string;
  /** Probe IDs this pack contains — informational only on the platform side. */
  probeIds: string[];
  /** Engines this pack needs to fully exercise its probes. */
  requiredEngines: ReadonlySet<ProbeEngine>;
  /** Whether this pack is implemented end-to-end and selectable in the wizard. */
  available: boolean;
  /** Icon for the wizard card. */
  icon: LucideIcon;
  /** Beachhead audience copy — who this pack is for. */
  audience: string;
}

const WEB_CLASSICS_PROBE_IDS = [
  'site_console_error',
  'site_form_auth_gap',
  'site_concurrent_submit_race',
  'site_response_latency',
  'site_form_500_on_adversarial',
  'agent_system_prompt_leak',
  'agent_jailbreak',
  'agent_prompt_injection',
  'agent_hallucination',
  'agent_off_topic_drift',
  'agent_no_rate_limit',
  'agent_response_latency',
  'api_no_rate_limit',
  'api_unauthenticated_500',
  'api_malformed_input_500',
  'api_cors_or_security_headers',
];

// Full catalog (12/12) — Pass A + B + C shipped. See worker/src/engine/probes/ai-built-apps.ts.
const AI_BUILT_APPS_PROBE_IDS = [
  'hardcoded_secret_in_bundle',
  'supabase_anon_key_exposed',
  'missing_rls_on_public_tables',
  'firebase_rules_open',
  'default_error_page_leak',
  'exposed_debug_endpoints',
  'insecure_cors_on_api_routes',
  'missing_rate_limit_on_auth',
  'client_side_auth_only',
  'unvalidated_redirect',
  'missing_csrf_protection',
  'dependency_with_known_cve',
];

// Full catalog (10/10) — Phase 13 + 13c + 13d.
const LLM_ENDPOINTS_PROBE_IDS = [
  'system_prompt_extraction',
  'prompt_injection_via_user_content',
  'pii_echo_in_response',
  'cost_amplification_attack',
  'unsafe_tool_call_execution',
  'jailbreak_bypass',
  'hallucination_on_factual_query',
  'missing_output_length_cap',
  'no_rate_limit_on_llm_endpoint',
  'response_format_violation',
  'markdown_link_injection',
];

// Full catalog (10/10) — Phase 13b + 13e.
const MCP_SERVER_PROBE_IDS = [
  'missing_auth_on_mcp_transport',
  'credential_leak_in_tool_desc',
  'tool_description_injection',
  'tool_name_collision',
  'tool_invocation_without_confirmation',
  'schema_violation_on_tool_input',
  'logging_sensitive_data',
  'unbounded_resource_list',
  'cross_resource_access',
  'capability_escalation_via_sampling',
];

const AGENT_RUNTIME_PROBE_IDS: string[] = [];

export const PACKS: Record<PackId, PackDefinition> = {
  web_classics: {
    id: 'web_classics',
    label: 'Web Classics',
    tagline: 'The original Oracle Bot probe set.',
    description:
      'Race conditions, auth gaps, malformed-input handling, prompt injection, hallucinations, jailbreaks, rate-limit cliffs. Every run created before packs existed runs this implicitly.',
    probeIds: WEB_CLASSICS_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['site', 'agent', 'api']),
    available: true,
    icon: Layers,
    audience: 'Any web app, AI agent, or API approaching launch.',
  },
  ai_built_apps: {
    id: 'ai_built_apps',
    label: 'AI-Built Apps',
    tagline: 'Failure modes specific to AI-generated code.',
    description:
      'Hardcoded secrets in client bundles, exposed Supabase anon keys, leaked stack traces on errors, dev/debug endpoints reachable in production, permissive CORS — patterns that AI coding agents ship by default.',
    probeIds: AI_BUILT_APPS_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['site']),
    available: true,
    icon: Sparkles,
    audience: 'Apps shipped via Lovable, v0, Bolt, Cursor, Replit Agent, Claude Code.',
  },
  llm_endpoints: {
    id: 'llm_endpoints',
    label: 'LLM Endpoints',
    tagline: 'Adversarial probes for HTTP endpoints wrapping an LLM.',
    description:
      'System-prompt extraction and prompt injection via user content shipped today. PII echo, cost amplification, jailbreak, unsafe tool-call execution, and output-length-cap probes follow.',
    probeIds: LLM_ENDPOINTS_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['agent']),
    available: true,
    icon: MessageSquare,
    audience: 'Anyone shipping a chatbot, RAG endpoint, or LLM-backed API.',
  },
  mcp_server: {
    id: 'mcp_server',
    label: 'MCP Server',
    tagline: 'Tool poisoning and capability-escalation probes for MCP servers.',
    description:
      'Missing transport auth, credential leakage in tool descriptions, and tool-description injection shipped today. Tool-name collision, unbounded resource list, capability escalation via sampling, and more follow.',
    probeIds: MCP_SERVER_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['api']),
    available: true,
    icon: Wrench,
    audience: 'Teams deploying MCP servers that expose tools to AI hosts.',
  },
  agent_runtime: {
    id: 'agent_runtime',
    label: 'Agent Runtime',
    tagline: 'Long-horizon adversarial probes for production AI agents.',
    description:
      'Multi-turn jailbreak escalation, tool-use safety boundaries, memory poisoning, persona drift across sessions. The deepest adversarial pack.',
    probeIds: AGENT_RUNTIME_PROBE_IDS,
    requiredEngines: new Set<ProbeEngine>(['agent']),
    available: false,
    icon: Globe,
    audience: 'Production AI agents handling real user sessions.',
  },
};

export const PACK_LIST: PackDefinition[] = PACK_IDS.map((id) => PACKS[id]);

/** Reverse index: probe id → pack id. Built once at module load. */
const PROBE_TO_PACK: ReadonlyMap<string, PackId> = (() => {
  const m = new Map<string, PackId>();
  for (const id of PACK_IDS) {
    for (const probeId of PACKS[id].probeIds) m.set(probeId, id);
  }
  return m;
})();

/** Find the pack that owns the given probe id, if any. */
export function packForProbe(probeId: string | null | undefined): PackDefinition | null {
  if (!probeId) return null;
  const id = PROBE_TO_PACK.get(probeId);
  return id ? PACKS[id] : null;
}

/** Type guard: is the given string a known pack id? */
export function isPackId(value: string): value is PackId {
  return (PACK_IDS as readonly string[]).includes(value);
}

/**
 * Pick a primary mode for a run row given the union of required engines.
 * Mirrors `modeForPacks` on the worker side.
 */
export function modeForPacks(packIds: PackId[]): 'site' | 'agent' | 'api' | 'stack' {
  const engines = new Set<ProbeEngine>();
  for (const id of packIds) {
    for (const e of PACKS[id].requiredEngines) engines.add(e);
  }
  if (engines.size > 1) return 'stack';
  if (engines.has('site')) return 'site';
  if (engines.has('agent')) return 'agent';
  if (engines.has('api')) return 'api';
  return 'site';
}

/** Returns the implicit pack list for a legacy mode-based run. */
export function packsForLegacyMode(_mode: 'site' | 'agent' | 'api' | 'stack'): PackId[] {
  return ['web_classics'];
}

// Avoid an unused-import warning if Terminal stays referenced only for future packs.
void Terminal;
