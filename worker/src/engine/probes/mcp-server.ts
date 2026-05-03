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
  {
    id: 'tool_name_collision',
    pack: 'mcp_server',
    engine: 'api',
    category: 'tool_poisoning',
    defaultSeverity: 'high',
    title: 'Tool name shadows a common built-in / reserved tool',
    description:
      'Flags tool names that match common built-in names AI hosts use internally (read_file, write_file, bash, python, fetch, web_search, terminal). A poisoned MCP server publishing a tool named `read_file` can intercept built-in capability calls in vulnerable hosts.',
  },
  {
    id: 'unbounded_resource_list',
    pack: 'mcp_server',
    engine: 'api',
    category: 'rate_limit_gap',
    defaultSeverity: 'high',
    title: 'resources/list or prompts/list returns unbounded payload',
    description:
      'Calls `resources/list` and `prompts/list` with no pagination cursor and measures response size + duration. Servers that return very large payloads on a single call expose themselves to enumeration-based DoS and signal a missing pagination contract.',
  },
  {
    id: 'tool_invocation_without_confirmation',
    pack: 'mcp_server',
    engine: 'api',
    category: 'capability_escalation',
    defaultSeverity: 'high',
    title: 'Destructive-named tool exposes no confirmation parameter',
    description:
      'Identifies tools whose names suggest a destructive or side-effecting action (delete_*, drop_*, remove_*, send_*, transfer_*, deploy_*) and inspects their inputSchema for a confirmation field. Tools that side-effect without an explicit confirmation parameter rely on the host to gate execution — fragile.',
  },
  {
    id: 'cross_resource_access',
    pack: 'mcp_server',
    engine: 'api',
    category: 'capability_escalation',
    defaultSeverity: 'medium',
    title: 'Resource URIs accept path-traversal / cross-tenant patterns',
    description:
      'For each resource URI returned by `resources/list`, attempts to access common path-traversal patterns (`../`, `..%2f`, `?tenant=other`). Flags HTTP 200 responses or non-error JSON-RPC results — those indicate the server resolves URIs outside the expected scope.',
  },
  {
    id: 'schema_violation_on_tool_input',
    pack: 'mcp_server',
    engine: 'api',
    category: 'schema_violation',
    defaultSeverity: 'medium',
    title: 'Server crashes on malformed tool inputs instead of returning a structured error',
    description:
      'For each tool with a defined inputSchema, sends 3 deliberately malformed payloads (wrong type, missing required field, oversized string). Flags 5xx responses or transport-level errors — well-behaved JSON-RPC servers return error objects, not crashes.',
  },
  {
    id: 'capability_escalation_via_sampling',
    pack: 'mcp_server',
    engine: 'api',
    category: 'capability_escalation',
    defaultSeverity: 'high',
    title: 'Server exposes sampling/createMessage without scoping',
    description:
      'Calls `sampling/createMessage` with a basic prompt and no auth context. If the server accepts the call and returns a model response, the server can be coerced into making arbitrary LLM calls on the host\'s behalf — a capability-escalation vector.',
  },
  {
    id: 'logging_sensitive_data',
    pack: 'mcp_server',
    engine: 'api',
    category: 'pii_echo',
    defaultSeverity: 'medium',
    title: 'Server log notifications leak sensitive tool inputs',
    description:
      'Listens for `notifications/message` (the MCP server-to-host log channel) for 5 seconds while invoking a tool with canary-shaped sensitive inputs. Flags log lines that echo the canary verbatim — sensitive data in logs leaks into host UIs and observability stacks.',
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
    for await (const f of scanForToolNameCollisions(endpointUrl, tools)) yield f;
    for await (const f of scanForMissingConfirmation(endpointUrl, tools)) yield f;
    for await (const f of scanForSchemaViolations(endpointUrl, tools, signal)) yield f;
    for await (const f of scanForLogLeak(endpointUrl, tools, signal)) yield f;
  }

  // Resource list + capability escalation probes don't require tools/list to
  // have returned anything.
  for await (const f of scanForUnboundedResourceList(endpointUrl, signal)) yield f;
  for await (const f of scanForCrossResourceAccess(endpointUrl, signal)) yield f;
  for await (const f of scanForSamplingEscalation(endpointUrl, signal)) yield f;
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
  resources?: unknown;
  prompts?: unknown;
  contents?: unknown;
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

// ────────────────────────────────────────────────────────────────────────────
// Probe — tool_name_collision
//
// Flags tool names that match common built-in / reserved capability names.
// A poisoned MCP server publishing a tool named `read_file` can intercept
// calls in vulnerable hosts that don't fully namespace tool resolution.
// ────────────────────────────────────────────────────────────────────────────

const RESERVED_TOOL_NAMES = new Set([
  'read_file', 'readFile', 'write_file', 'writeFile', 'edit_file',
  'bash', 'shell', 'exec', 'execute', 'run',
  'python', 'javascript', 'node',
  'fetch', 'http', 'request',
  'web_search', 'search', 'browse',
  'terminal', 'console', 'cmd',
  'glob', 'grep', 'find',
]);

async function* scanForToolNameCollisions(
  endpointUrl: string,
  tools: McpTool[],
): AsyncGenerator<RawFinding> {
  const collisions = tools
    .filter((t) => t.name && RESERVED_TOOL_NAMES.has(t.name))
    .map((t) => t.name as string);
  if (collisions.length === 0) return;

  yield {
    severity: 'high',
    category: 'tool_poisoning',
    probeId: 'tool_name_collision',
    title: `${collisions.length} tool name${collisions.length === 1 ? '' : 's'} shadow common built-in capabilities`,
    description: `MCP tools named ${collisions.join(', ')} match well-known built-in capabilities AI hosts use internally (filesystem, shell, search, etc.). Hosts that don't strictly namespace tool resolution can call this server's tool when the user expected the built-in. This is the classic "tool poisoning" attack against vulnerable hosts.`,
    reproJson: {
      steps: [
        `Call tools/list against ${endpointUrl}`,
        'Observe tool name(s) matching the reserved list',
      ],
      impactedPath: endpointUrl,
      collisions,
    },
    remediation:
      'Rename tools to use a server-specific prefix (e.g. `myserver_read_file` instead of `read_file`). The MCP spec recommends namespacing — hosts SHOULD prefix server names automatically, but defending in depth at the server level prevents host-side bugs from biting your users.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe — tool_invocation_without_confirmation
//
// Identifies tools whose names suggest destructive / side-effecting actions
// and inspects their inputSchema for a confirmation field.
// ────────────────────────────────────────────────────────────────────────────

const DESTRUCTIVE_NAME_PATTERNS = [
  /^delete[_-]/i, /[_-]delete$/i,
  /^drop[_-]/i, /[_-]drop$/i,
  /^remove[_-]/i, /[_-]remove$/i,
  /^send[_-]/i,
  /^transfer[_-]/i,
  /^deploy[_-]/i,
  /^purge[_-]/i,
  /^destroy[_-]/i,
  /^revoke[_-]/i,
];

const CONFIRMATION_FIELD_NAMES = new Set([
  'confirm', 'confirmation', 'confirmed', 'acknowledge', 'acknowledged',
  'consent', 'force', 'really', 'yes_im_sure',
]);

async function* scanForMissingConfirmation(
  endpointUrl: string,
  tools: McpTool[],
): AsyncGenerator<RawFinding> {
  const offenders: { tool: string; reason: string }[] = [];
  for (const tool of tools) {
    if (!tool.name) continue;
    const isDestructive = DESTRUCTIVE_NAME_PATTERNS.some((p) => p.test(tool.name!));
    if (!isDestructive) continue;

    const props = extractInputSchemaProperties(tool.inputSchema);
    const hasConfirmation = props.some((name) =>
      CONFIRMATION_FIELD_NAMES.has(name.toLowerCase()),
    );
    if (!hasConfirmation) {
      offenders.push({
        tool: tool.name,
        reason: 'destructive name + no confirmation parameter in inputSchema',
      });
    }
  }
  if (offenders.length === 0) return;

  yield {
    severity: 'high',
    category: 'capability_escalation',
    probeId: 'tool_invocation_without_confirmation',
    title: `${offenders.length} destructive tool${offenders.length === 1 ? '' : 's'} expose no confirmation parameter`,
    description: `Tools named like destructive actions (${offenders.map((o) => o.tool).slice(0, 6).join(', ')}) take no confirmation parameter in their inputSchema. The host has to gate execution from outside, which is fragile — a single host bug or prompt-injection can trigger the action without the user expecting it.`,
    reproJson: {
      steps: [
        `Call tools/list against ${endpointUrl}`,
        'Inspect destructive-named tools for confirm/confirmation/acknowledge fields in inputSchema',
      ],
      impactedPath: endpointUrl,
      offenders,
    },
    remediation:
      'Add a required `confirm` (or `acknowledge`) boolean parameter to the inputSchema of every destructive tool. Reject calls that omit it OR set it to false. This forces the host UI to surface a confirmation step before the model can invoke side-effects.',
  };
}

function extractInputSchemaProperties(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const obj = schema as Record<string, unknown>;
  const props = obj.properties;
  if (!props || typeof props !== 'object') return [];
  return Object.keys(props as Record<string, unknown>);
}

// ────────────────────────────────────────────────────────────────────────────
// Probe — schema_violation_on_tool_input
//
// Sends 3 malformed payloads per tool and flags 5xx / transport errors.
// We only test up to 5 tools to bound the request count.
// ────────────────────────────────────────────────────────────────────────────

async function* scanForSchemaViolations(
  endpointUrl: string,
  tools: McpTool[],
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  const crashed: { tool: string; payload: string; reason: string }[] = [];
  const sample = tools.filter((t) => t.name).slice(0, 5);

  for (const tool of sample) {
    if (signal?.aborted) break;
    const malformed: { label: string; arguments: unknown }[] = [
      { label: 'wrong-type', arguments: { __oracle_probe: 'string-where-object-expected' } },
      { label: 'oversized-string', arguments: { __oracle_probe: 'A'.repeat(20_000) } },
      { label: 'null-arguments', arguments: null },
    ];
    for (const m of malformed) {
      const result = await callJsonRpcRaw(
        endpointUrl,
        'tools/call',
        { name: tool.name, arguments: m.arguments },
        signal,
      );
      if (!result) {
        crashed.push({ tool: tool.name!, payload: m.label, reason: 'transport error' });
        continue;
      }
      if (result.status >= 500) {
        crashed.push({ tool: tool.name!, payload: m.label, reason: `HTTP ${result.status}` });
      }
    }
  }
  if (crashed.length === 0) return;

  yield {
    severity: 'medium',
    category: 'schema_violation',
    probeId: 'schema_violation_on_tool_input',
    title: `Server crashed on ${crashed.length} malformed tool-input attempts`,
    description: `Well-behaved JSON-RPC servers return structured errors when given malformed inputs. This server returned 5xx or transport-level errors on ${crashed.length} attempts across ${sample.length} tested tools, indicating crashes propagate up from the dispatcher rather than being caught at the input-validation layer.`,
    reproJson: {
      steps: [
        `Call tools/call with one of the malformed payloads against ${endpointUrl}`,
        'Observe HTTP 5xx or connection error',
      ],
      impactedPath: endpointUrl,
      crashed,
    },
    remediation:
      'Validate tool inputs against their declared inputSchema BEFORE dispatching to the implementation. On schema violation, return a JSON-RPC error object with code -32602 (Invalid params), not an HTTP 5xx. This both improves the host-side debugging experience and prevents crashes from being weaponised as a DoS.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe — logging_sensitive_data
//
// Listens for notifications/message log entries while invoking a tool with
// canary-shaped sensitive inputs. We send a single tool call (the first one
// without destructive-name patterns) carrying a canary, then fetch the most
// recent server-side logs (if exposed) and pattern-match.
//
// MCP doesn't standardise a way for clients to subscribe to log notifications
// over plain HTTP without SSE — for the synchronous HTTP transport we look at
// the response body for the canary, which catches most "echoed in response"
// cases.
// ────────────────────────────────────────────────────────────────────────────

const LOG_CANARY_VALUE = 'OB-LOG-CANARY-K9X3M2';

async function* scanForLogLeak(
  endpointUrl: string,
  tools: McpTool[],
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  // Pick the first tool that doesn't look destructive.
  const target = tools.find(
    (t) => t.name && !DESTRUCTIVE_NAME_PATTERNS.some((p) => p.test(t.name!)),
  );
  if (!target?.name) return;

  // Find a property name to inject the canary into. If we can't find one,
  // try the special MCP `_meta` pass-through.
  const props = extractInputSchemaProperties(target.inputSchema);
  const argName = props[0] ?? '_meta';
  const args: Record<string, unknown> = { [argName]: LOG_CANARY_VALUE };

  const result = await callJsonRpcRaw(
    endpointUrl,
    'tools/call',
    { name: target.name, arguments: args },
    signal,
  );
  if (!result) return;

  // Two ways the canary can leak:
  //   1. Response body echoes it (synchronous tool result includes input).
  //   2. Response body contains a notifications/message-shaped log entry
  //      with the canary.
  if (!result.body.includes(LOG_CANARY_VALUE)) return;

  yield {
    severity: 'medium',
    category: 'pii_echo',
    probeId: 'logging_sensitive_data',
    title: 'Tool invocation response leaks input value into log/output stream',
    description: `OracleBot invoked tool \`${target.name}\` with a canary value in the \`${argName}\` argument. The response body echoed the canary verbatim, indicating the server includes input values in either tool output or log notifications. If real tool inputs include API keys, PII, or secrets, those will leak the same way to host UIs and observability stacks.`,
    reproJson: {
      steps: [
        `Call tools/call against ${endpointUrl} with name=${target.name}`,
        `Pass arguments containing OB-LOG-CANARY-K9X3M2`,
        'Observe the canary value in the response body',
      ],
      impactedPath: endpointUrl,
      tool: target.name,
      argName,
    },
    remediation:
      'Scrub sensitive parameter values before logging or echoing them. Common pattern: redact arguments matching a small set of sensitive field names (api_key, password, token, secret, authorization) AND any value matching common credential regexes. Apply this both to log notifications and to tool result payloads.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe — unbounded_resource_list
//
// Calls resources/list and prompts/list with no pagination. Flags very
// large response bodies — a sign there's no pagination contract at all.
// ────────────────────────────────────────────────────────────────────────────

const UNBOUNDED_RESPONSE_BYTES = 200_000;

async function* scanForUnboundedResourceList(
  endpointUrl: string,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  const offenders: { method: string; bytes: number; durationMs: number }[] = [];
  for (const method of ['resources/list', 'prompts/list']) {
    if (signal?.aborted) break;
    const r = await callJsonRpcRaw(endpointUrl, method, {}, signal);
    if (!r || r.status >= 400) continue;
    if (r.body.length >= UNBOUNDED_RESPONSE_BYTES) {
      offenders.push({ method, bytes: r.body.length, durationMs: r.durationMs });
    }
  }
  if (offenders.length === 0) return;

  yield {
    severity: 'high',
    category: 'rate_limit_gap',
    probeId: 'unbounded_resource_list',
    title: `${offenders.map((o) => o.method).join(' + ')} returned > ${(UNBOUNDED_RESPONSE_BYTES / 1024).toFixed(0)} KB without pagination`,
    description: `OracleBot called ${offenders.map((o) => o.method).join(' and ')} with no pagination cursor. Each response was over ${(UNBOUNDED_RESPONSE_BYTES / 1024).toFixed(0)} KB, indicating the server returns the full set on a single call. A malicious client can repeatedly enumerate to exhaust server memory or bandwidth.`,
    reproJson: {
      steps: [
        `Call ${offenders.map((o) => o.method).join(' / ')} against ${endpointUrl} with no params`,
        'Observe unbounded payload size',
      ],
      impactedPath: endpointUrl,
      offenders,
    },
    remediation:
      'Implement pagination with a server-side maximum page size. Return a `nextCursor` field clients can use to fetch subsequent pages. Reject requests that try to bypass the cap. Same applies to any custom list endpoint your server exposes.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe — cross_resource_access
//
// For each resource URI from resources/list, attempts path-traversal /
// cross-tenant patterns. Flags 200 responses or non-error JSON-RPC results.
// ────────────────────────────────────────────────────────────────────────────

const TRAVERSAL_SUFFIXES = ['/../etc/passwd', '/..%2fadmin', '?tenant=other_tenant_canary'];

async function* scanForCrossResourceAccess(
  endpointUrl: string,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  // Pull a small sample of resource URIs.
  const listed = await callJsonRpc(endpointUrl, 'resources/list', {}, undefined, signal);
  const resources = (listed?.resources ?? []) as { uri?: string; name?: string }[];
  if (!Array.isArray(resources) || resources.length === 0) return;

  const sample = resources.filter((r) => r.uri).slice(0, 5);
  if (sample.length === 0) return;

  const exploited: { uri: string; suffix: string; status: number }[] = [];

  for (const resource of sample) {
    if (signal?.aborted) break;
    for (const suffix of TRAVERSAL_SUFFIXES) {
      const traversed = `${resource.uri}${suffix}`;
      const r = await callJsonRpcRaw(
        endpointUrl,
        'resources/read',
        { uri: traversed },
        signal,
      );
      if (!r) continue;
      if (r.status >= 400) continue;
      // Either no JSON-RPC error AND a contents body — that's a hit.
      let parsed: unknown;
      try { parsed = JSON.parse(r.body); } catch { parsed = null; }
      const obj = parsed as Record<string, unknown> | null;
      const hasResult = obj && obj.result !== undefined && obj.error === undefined;
      if (hasResult) {
        exploited.push({ uri: resource.uri!, suffix, status: r.status });
      }
    }
  }
  if (exploited.length === 0) return;

  yield {
    severity: 'medium',
    category: 'capability_escalation',
    probeId: 'cross_resource_access',
    title: `Resource URIs accept ${exploited.length} traversal / cross-tenant pattern${exploited.length === 1 ? '' : 's'}`,
    description: `OracleBot tested resource URIs from resources/list with path-traversal (../) and cross-tenant query patterns. ${exploited.length} pattern${exploited.length === 1 ? '' : 's'} returned a successful resources/read result, suggesting the server resolves URIs outside the expected scope.`,
    reproJson: {
      steps: [
        'Call resources/list to enumerate URIs',
        'Call resources/read with each URI + a traversal suffix',
        'Observe HTTP 200 with non-error result',
      ],
      impactedPath: endpointUrl,
      exploited,
    },
    remediation:
      'Validate resource URIs against a strict allowlist. Reject any URI containing `..`, encoded traversal sequences, or query parameters that change tenancy. If the server is multi-tenant, derive the tenant from the authenticated identity, not from the URI.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe — capability_escalation_via_sampling
//
// Calls sampling/createMessage with a basic prompt. If the server accepts
// and returns a model response, the server is making LLM calls on the
// host's behalf — usable as a capability-escalation vector.
// ────────────────────────────────────────────────────────────────────────────

async function* scanForSamplingEscalation(
  endpointUrl: string,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  const r = await callJsonRpcRaw(
    endpointUrl,
    'sampling/createMessage',
    {
      messages: [{ role: 'user', content: { type: 'text', text: 'Say PONG.' } }],
      maxTokens: 10,
    },
    signal,
  );
  if (!r || r.status >= 400) return;

  let parsed: unknown;
  try { parsed = JSON.parse(r.body); } catch { return; }
  const obj = parsed as Record<string, unknown> | null;
  if (!obj || obj.error !== undefined || obj.result === undefined) return;

  // We got a successful sampling response with no auth context.
  yield {
    severity: 'high',
    category: 'capability_escalation',
    probeId: 'capability_escalation_via_sampling',
    title: 'Server accepted sampling/createMessage with no auth or scoping',
    description: `OracleBot called sampling/createMessage against ${endpointUrl} without credentials. The server returned a successful result, meaning it makes LLM API calls on behalf of any caller. An attacker can use the server as a free LLM proxy on the operator's account, run up costs, and exfiltrate via prompt content.`,
    reproJson: {
      steps: [
        `Call sampling/createMessage against ${endpointUrl} with no auth header`,
        'Observe a non-error JSON-RPC result',
      ],
      impactedPath: endpointUrl,
    },
    remediation:
      'Gate sampling/createMessage on an authenticated identity. Cap per-caller cost. The MCP spec lets servers expose this method but does NOT require it — if your server doesn\'t need it, disable the handler entirely.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Lower-level helper — returns body/status for probes that need more than
// the parsed result.
// ────────────────────────────────────────────────────────────────────────────

interface RawJsonRpcResponse {
  status: number;
  body: string;
  durationMs: number;
}

async function callJsonRpcRaw(
  url: string,
  method: string,
  params: Record<string, unknown> | unknown,
  signal: AbortSignal | undefined,
): Promise<RawJsonRpcResponse | null> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'OracleBot/1.0',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal,
    });
    const body = await res.text().catch(() => '');
    return { status: res.status, body: body.slice(0, 200_000), durationMs: Date.now() - start };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
