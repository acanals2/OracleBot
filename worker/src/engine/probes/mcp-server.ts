/**
 * mcp_server probe pack — Phase 13b.
 *
 * Targets MCP (Model Context Protocol) servers exposed over HTTP or SSE.
 * Stdio transport is out of scope — it requires a different connection
 * shape and is rare in production deployments.
 *
 * What MCP servers expose:
 *   - GET  /  → server info (name, version, capabilities)
 *   - POST / → JSON-RPC requests: tools/list, tools/call, resources/list,
 *                                 prompts/list, sampling/createMessage, …
 *
 * Safety contract (consistent with all other OracleBot probes):
 *   1. Read-only intent. We call tools/list and resources/list. We do NOT
 *      invoke any tool — even non-destructive-sounding ones — without an
 *      explicit safety review of the tool's contract.
 *   2. Bounded request count. ≤ 10 requests per probe.
 *   3. Findings persist tool names + parameter names only. Never tool
 *      descriptions in plaintext (those are the leak vector for probe 3).
 */
import { registerProbe, type ProbeDefinition } from '../packs.js';
import type { RawFinding } from '../types.js';

// ────────────────────────────────────────────────────────────────────────────
// Probe metadata registry
// ────────────────────────────────────────────────────────────────────────────

const PROBES: ProbeDefinition[] = [
  {
    id: 'missing_auth_on_mcp_transport',
    pack: 'mcp_server',
    engine: 'api',
    category: 'auth_gap',
    defaultSeverity: 'critical',
    title: 'MCP transport accepts unauthenticated tool listings',
    description:
      'Connects to the MCP server\'s HTTP/SSE transport without credentials and issues an unauthenticated `tools/list` JSON-RPC request. Servers that reply with a populated tool catalog leak the full surface to anyone on the internet.',
  },
  {
    id: 'credential_leak_in_tool_desc',
    pack: 'mcp_server',
    engine: 'api',
    category: 'credential_in_tool_desc',
    defaultSeverity: 'critical',
    title: 'Credentials embedded in tool descriptions / parameter schemas',
    description:
      'Calls `tools/list` and pattern-matches the returned descriptions and parameter schemas for known secret formats (OpenAI / Anthropic / Stripe / GitHub / generic JWTs). Any AI host that calls these tools sees the credentials in plaintext.',
  },
  {
    id: 'tool_description_injection',
    pack: 'mcp_server',
    engine: 'api',
    category: 'tool_poisoning',
    defaultSeverity: 'high',
    title: 'Tool description contains instruction-shaped content',
    description:
      'Calls `tools/list` and flags descriptions that contain instruction-shaped patterns ("ignore previous", "system:", "</tool>", explicit override keywords). An attacker who controls a tool description can hijack the host model into following arbitrary instructions.',
  },
];

let registered = false;
export function registerMcpServerProbes(): void {
  if (registered) return;
  for (const probe of PROBES) registerProbe(probe);
  registered = true;
}

// ────────────────────────────────────────────────────────────────────────────
// Scan entry point
// ────────────────────────────────────────────────────────────────────────────

export interface McpServerScanOpts {
  endpointUrl: string;
  signal?: AbortSignal;
}

export async function* runMcpServerScan(
  opts: McpServerScanOpts,
): AsyncGenerator<RawFinding> {
  const { endpointUrl, signal } = opts;

  // Step 1 — call tools/list with no credentials.
  const toolsList = await callJsonRpc(endpointUrl, 'tools/list', {}, undefined, signal);

  // Step 2 — if it succeeded with no auth, that's the missing_auth probe.
  if (toolsList && toolsList.tools && Array.isArray(toolsList.tools) && toolsList.tools.length > 0) {
    yield buildAuthGapFinding(endpointUrl, toolsList.tools);
  }

  // Step 3 — if we got tools at all (auth-gated or not), scan for credential
  // leaks + injection patterns in their descriptions / schemas.
  const tools = toolsList?.tools && Array.isArray(toolsList.tools) ? (toolsList.tools as McpTool[]) : [];
  if (tools.length > 0) {
    for await (const f of scanForCredentialLeaks(endpointUrl, tools)) yield f;
    for await (const f of scanForInjectionPatterns(endpointUrl, tools)) yield f;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Probe — missing_auth_on_mcp_transport
// ────────────────────────────────────────────────────────────────────────────

function buildAuthGapFinding(endpointUrl: string, tools: McpTool[]): RawFinding {
  const toolNames = tools.map((t) => t.name).filter(Boolean).slice(0, 12);
  return {
    severity: 'critical',
    category: 'auth_gap',
    probeId: 'missing_auth_on_mcp_transport',
    title: `MCP transport returned ${tools.length} tools without authentication`,
    description: `An unauthenticated JSON-RPC \`tools/list\` request to ${endpointUrl} returned ${tools.length} tool definition${tools.length === 1 ? '' : 's'}. Anyone on the internet can enumerate the full tool surface, and (depending on your invocation gate) potentially call them. ${toolNames.length > 0 ? `Tool names: ${toolNames.join(', ')}${tools.length > toolNames.length ? ` (+${tools.length - toolNames.length} more)` : ''}.` : ''}`,
    reproJson: {
      steps: [
        `POST ${endpointUrl} with no Authorization header`,
        'Body: {"jsonrpc":"2.0","id":1,"method":"tools/list"}',
        'Observe HTTP 200 with non-empty tools array',
      ],
      impactedPath: endpointUrl,
      toolCount: tools.length,
      toolNames,
    },
    remediation:
      'Require an Authorization header (Bearer token or API key) on the MCP transport. Reject unauthenticated `tools/list` requests with 401. If the MCP server is intentionally public, consider why every tool description is reachable without rate limiting.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe — credential_leak_in_tool_desc
// ────────────────────────────────────────────────────────────────────────────

interface SecretPattern {
  name: string;
  re: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'OpenAI API key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/g },
  { name: 'Anthropic API key', re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{60,}\b/g },
  { name: 'Stripe live secret key', re: /\bsk_live_[A-Za-z0-9]{24,}\b/g },
  { name: 'GitHub personal access token', re: /\bghp_[A-Za-z0-9]{36,}\b/g },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{80,}\b/g },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  // URL with embedded basic-auth credentials.
  { name: 'URL with embedded credentials', re: /https?:\/\/[^\s/$.?#:]+:[^\s/$.?#@]+@[^\s]+/g },
  // Generic JWT-shape; only flag when it appears in a tool description (not a normal place for a JWT to live).
  { name: 'JWT-shaped token', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g },
];

async function* scanForCredentialLeaks(
  endpointUrl: string,
  tools: McpTool[],
): AsyncGenerator<RawFinding> {
  const findings: { tool: string; field: string; provider: string }[] = [];

  for (const tool of tools) {
    const buckets: { field: string; text: string }[] = [
      { field: 'description', text: tool.description ?? '' },
      { field: 'inputSchema', text: stringifySafe(tool.inputSchema) },
    ];
    for (const bucket of buckets) {
      if (!bucket.text) continue;
      for (const pattern of SECRET_PATTERNS) {
        pattern.re.lastIndex = 0;
        if (pattern.re.test(bucket.text)) {
          findings.push({ tool: tool.name ?? '<unnamed>', field: bucket.field, provider: pattern.name });
        }
      }
    }
  }

  if (findings.length === 0) return;

  const tools_list = [...new Set(findings.map((f) => f.tool))].slice(0, 10);
  yield {
    severity: 'critical',
    category: 'credential_in_tool_desc',
    probeId: 'credential_leak_in_tool_desc',
    title: `${findings.length} credential pattern${findings.length === 1 ? '' : 's'} found in ${tools_list.length} MCP tool definition${tools_list.length === 1 ? '' : 's'}`,
    description: `OracleBot pattern-matched the descriptions and parameter schemas returned by \`tools/list\` for known secret formats. Affected tools: ${tools_list.join(', ')}. Any AI host that loads this server's catalog will see these credentials in plaintext.`,
    reproJson: {
      steps: [
        `POST ${endpointUrl} with method "tools/list"`,
        'Inspect the description and inputSchema fields of each returned tool',
        'Search for the pattern matches listed in `matches`',
      ],
      impactedPath: endpointUrl,
      // Persist tool name + field + provider only. Never the matched secret.
      matches: findings.map((f) => ({ tool: f.tool, field: f.field, provider: f.provider })),
    },
    remediation:
      'Treat tool descriptions and parameter schemas as untrusted public surface. Move credentials into a server-side configuration that the tool implementation reads at call time. If a tool genuinely needs to expose configuration to the host, use opaque references (a key id) and resolve them server-side.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe — tool_description_injection
// ────────────────────────────────────────────────────────────────────────────

const INJECTION_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'instruction-override', re: /\bignore (?:all )?(?:previous|prior|earlier) (?:instructions?|prompts?)\b/i },
  { name: 'system-impersonation', re: /^\s*\[?system\]?\s*[:>]/im },
  { name: 'fake-end-tag', re: /<\/?(?:tool|assistant|system|user)\s*>/i },
  { name: 'override-keyword', re: /\b(?:override|disregard|forget) (?:these |the )?instructions?\b/i },
  { name: 'role-claim', re: /\byou are now (?:a |the )?(?:admin|root|developer|administrator)\b/i },
];

async function* scanForInjectionPatterns(
  endpointUrl: string,
  tools: McpTool[],
): AsyncGenerator<RawFinding> {
  const hits: { tool: string; pattern: string }[] = [];
  for (const tool of tools) {
    const desc = tool.description ?? '';
    if (!desc) continue;
    for (const p of INJECTION_PATTERNS) {
      if (p.re.test(desc)) {
        hits.push({ tool: tool.name ?? '<unnamed>', pattern: p.name });
      }
    }
  }
  if (hits.length === 0) return;

  yield {
    severity: 'high',
    category: 'tool_poisoning',
    probeId: 'tool_description_injection',
    title: `${hits.length} MCP tool description${hits.length === 1 ? '' : 's'} contain instruction-shaped patterns`,
    description: `Tool descriptions are loaded into the host AI's context window when it decides which tool to call. Patterns like "ignore previous instructions" or fake </system> tags inside a description can hijack the host model. Affected tools: ${[...new Set(hits.map((h) => h.tool))].slice(0, 10).join(', ')}.`,
    reproJson: {
      steps: [
        `POST ${endpointUrl} with method "tools/list"`,
        'Inspect the description field of each returned tool',
        'Check for instruction-override / role-claim / fake-tag patterns',
      ],
      impactedPath: endpointUrl,
      hits,
    },
    remediation:
      'Sanitise tool descriptions before they are returned by `tools/list`. Strip or escape: instruction-override phrases, fake closing tags (</tool>, </system>), explicit role claims, and any text that looks like operator instructions. Treat descriptions as data, not instructions.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

interface McpTool {
  name?: string;
  description?: string;
  inputSchema?: unknown;
}

interface JsonRpcResult {
  tools?: unknown;
}

const REQUEST_TIMEOUT_MS = 8_000;

async function callJsonRpc(
  url: string,
  method: string,
  params: Record<string, unknown>,
  authHeader: string | undefined,
  signal: AbortSignal | undefined,
): Promise<JsonRpcResult | null> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'OracleBot/1.0',
    };
    if (authHeader) headers.authorization = authHeader;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { result?: JsonRpcResult } | null;
    return body?.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value ?? '');
  } catch {
    return '';
  }
}
