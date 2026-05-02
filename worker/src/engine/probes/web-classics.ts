/**
 * web_classics probe registry — Phase 10b.
 *
 * Each entry below is a metadata record for one of the 15 detections that
 * already exist inline in `site-bot.ts`, `agent-bot.ts`, and `api-bot.ts`.
 * The probe IDs here are the strings that engines tag onto their emitted
 * RawFindings via the new `probeId` field.
 *
 * No `runProbe` implementations yet — the actual detection logic stays in
 * the engine files until Phase 10c, when extraction becomes load-bearing
 * (e.g. when the user wants to run a single probe in isolation).
 */
import { registerProbe, type ProbeDefinition } from '../packs.js';

const WEB_CLASSICS: ProbeDefinition[] = [
  // ── site-bot ──────────────────────────────────────────────────────────
  {
    id: 'site_console_error',
    pack: 'web_classics',
    engine: 'site',
    category: 'integration_bug',
    defaultSeverity: 'medium',
    title: 'JS console error during navigation',
    description: 'Browser console emitted an error while a synthetic user navigated the site.',
  },
  {
    id: 'site_form_auth_gap',
    pack: 'web_classics',
    engine: 'site',
    category: 'auth_gap',
    defaultSeverity: 'high',
    title: 'Form submit returned non-2xx without auth',
    description: 'A state-mutating form accepted submission from an unauthenticated session.',
  },
  {
    id: 'site_concurrent_submit_race',
    pack: 'web_classics',
    engine: 'site',
    category: 'race_condition',
    defaultSeverity: 'high',
    title: 'Concurrent form submissions produced inconsistent responses',
    description:
      'Same payload submitted to the same endpoint at the same time produced duplicates or divergent responses.',
  },
  {
    id: 'site_response_latency',
    pack: 'web_classics',
    engine: 'site',
    category: 'latency_cascade',
    defaultSeverity: 'medium',
    title: 'Slow response under realistic load',
    description: 'Response time exceeded the latency budget for an interactive flow.',
  },
  {
    id: 'site_form_500_on_adversarial',
    pack: 'web_classics',
    engine: 'site',
    category: 'malformed_input',
    defaultSeverity: 'high',
    title: 'Server 500 on adversarial form input',
    description:
      'A form rendered a 5xx response when a synthetic user submitted adversarial-but-valid-looking input.',
  },

  // ── agent-bot ─────────────────────────────────────────────────────────
  {
    id: 'agent_system_prompt_leak',
    pack: 'web_classics',
    engine: 'agent',
    category: 'system_prompt_leak',
    defaultSeverity: 'critical',
    title: 'Agent revealed system prompt',
    description: 'Agent response contained text consistent with its own system instructions.',
  },
  {
    id: 'agent_jailbreak',
    pack: 'web_classics',
    engine: 'agent',
    category: 'jailbreak',
    defaultSeverity: 'high',
    title: 'Agent broke character / safety guardrails',
    description: 'Agent ignored its instructions when faced with a known jailbreak pattern.',
  },
  {
    id: 'agent_prompt_injection',
    pack: 'web_classics',
    engine: 'agent',
    category: 'prompt_injection',
    defaultSeverity: 'critical',
    title: 'Agent followed an injected instruction',
    description:
      'A user-controlled message embedded an instruction that the agent then executed as if it were operator-authored.',
  },
  {
    id: 'agent_hallucination',
    pack: 'web_classics',
    engine: 'agent',
    category: 'hallucination',
    defaultSeverity: 'medium',
    title: 'Agent confidently stated a falsehood',
    description: 'Agent fabricated a fact that could mislead a real user.',
  },
  {
    id: 'agent_off_topic_drift',
    pack: 'web_classics',
    engine: 'agent',
    category: 'off_topic_drift',
    defaultSeverity: 'low',
    title: 'Agent answered an unrelated request',
    description:
      'Agent engaged with a topic outside its declared scope when prompted by a synthetic user.',
  },
  {
    id: 'agent_no_rate_limit',
    pack: 'web_classics',
    engine: 'agent',
    category: 'rate_limit_gap',
    defaultSeverity: 'high',
    title: 'No rate limit on agent endpoint',
    description:
      'Burst traffic to the agent endpoint never triggered 429 responses, leaving cost / abuse exposure.',
  },
  {
    id: 'agent_response_latency',
    pack: 'web_classics',
    engine: 'agent',
    category: 'latency_cascade',
    defaultSeverity: 'medium',
    title: 'Slow agent response under realistic load',
    description: 'An agent turn exceeded the latency budget; degrades UX and may indicate runaway generation.',
  },

  // ── api-bot ───────────────────────────────────────────────────────────
  {
    id: 'api_no_rate_limit',
    pack: 'web_classics',
    engine: 'api',
    category: 'rate_limit_gap',
    defaultSeverity: 'high',
    title: 'No rate limit on API endpoint',
    description: 'Burst traffic to an API endpoint never triggered 429 responses.',
  },
  {
    id: 'api_unauthenticated_500',
    pack: 'web_classics',
    engine: 'api',
    category: 'auth_gap',
    defaultSeverity: 'high',
    title: 'Endpoint returned 500/200 when 401 expected',
    description:
      'Hitting a protected endpoint without credentials yielded a server error or a successful response instead of 401.',
  },
  {
    id: 'api_malformed_input_500',
    pack: 'web_classics',
    engine: 'api',
    category: 'malformed_input',
    defaultSeverity: 'high',
    title: 'API 500 on malformed input',
    description: 'API endpoint crashed with 5xx when sent malformed but well-formed-looking input.',
  },
  {
    id: 'api_cors_or_security_headers',
    pack: 'web_classics',
    engine: 'api',
    category: 'integration_bug',
    defaultSeverity: 'medium',
    title: 'Insecure CORS or missing security headers',
    description:
      'API responded with `Access-Control-Allow-Origin: *` or missing security headers on a sensitive endpoint.',
  },
];

let registered = false;

/**
 * Register all web_classics probes. Idempotent — safe to call from
 * multiple entry points (worker boot, tests).
 */
export function registerWebClassicsProbes(): void {
  if (registered) return;
  for (const probe of WEB_CLASSICS) registerProbe(probe);
  registered = true;
}

/** Probe ID constants — re-exported so engines can tag emissions without typos. */
export const WEB_CLASSICS_PROBE_IDS = {
  // site-bot
  SITE_CONSOLE_ERROR: 'site_console_error',
  SITE_FORM_AUTH_GAP: 'site_form_auth_gap',
  SITE_CONCURRENT_SUBMIT_RACE: 'site_concurrent_submit_race',
  SITE_RESPONSE_LATENCY: 'site_response_latency',
  SITE_FORM_500_ON_ADVERSARIAL: 'site_form_500_on_adversarial',
  // agent-bot
  AGENT_SYSTEM_PROMPT_LEAK: 'agent_system_prompt_leak',
  AGENT_JAILBREAK: 'agent_jailbreak',
  AGENT_PROMPT_INJECTION: 'agent_prompt_injection',
  AGENT_HALLUCINATION: 'agent_hallucination',
  AGENT_OFF_TOPIC_DRIFT: 'agent_off_topic_drift',
  AGENT_NO_RATE_LIMIT: 'agent_no_rate_limit',
  AGENT_RESPONSE_LATENCY: 'agent_response_latency',
  // api-bot
  API_NO_RATE_LIMIT: 'api_no_rate_limit',
  API_UNAUTHENTICATED_500: 'api_unauthenticated_500',
  API_MALFORMED_INPUT_500: 'api_malformed_input_500',
  API_CORS_OR_SECURITY_HEADERS: 'api_cors_or_security_headers',
} as const;
