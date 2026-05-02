/**
 * ai_built_apps probe pack — Phase 11 Pass A.
 *
 * Targets failure modes that AI coding agents (Lovable, v0, Bolt, Cursor,
 * Replit Agent, Claude Code) ship by default. This first pass implements
 * five read-only probes that don't require Playwright or pre-existing
 * forms — they fire off a small set of HTTP requests and grep client
 * bundles. Pass B will add probes that require live database probing
 * (RLS, Firestore rules, auth brute-force).
 *
 * Safety contract — every probe in this file MUST honor these rules:
 *   1. Read-only. GET and OPTIONS only. Never POST, PUT, PATCH, DELETE.
 *   2. Unauthenticated. We do not harvest or replay credentials.
 *   3. Scoped. Only the run's target URL host is contacted (plus the
 *      explicit Supabase URL we find inside the bundle, since that IS
 *      the target's own backend).
 *   4. Privacy. Findings carry hashes / partial fingerprints of leaked
 *      secrets, never the secret itself in plaintext.
 */
import { registerProbe, type ProbeDefinition } from '../packs.js';
import type { RawFinding } from '../types.js';

// ────────────────────────────────────────────────────────────────────────────
// Probe metadata registry
// ────────────────────────────────────────────────────────────────────────────

const PROBES: ProbeDefinition[] = [
  {
    id: 'hardcoded_secret_in_bundle',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'exposed_secret',
    defaultSeverity: 'critical',
    title: 'Hardcoded secret in client bundle',
    description:
      'Pattern-matches client-side JavaScript for known secret formats (OpenAI / Anthropic / Stripe / GitHub / Resend keys, generic JWTs, .env-leaked variables).',
  },
  {
    id: 'supabase_anon_key_exposed',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'client_key_leak',
    defaultSeverity: 'high',
    title: 'Supabase anon key in client bundle',
    description:
      'Scans the bundle for a Supabase project URL + anon JWT. The anon key alone is meant to be public — severity escalates only if the missing_rls_on_public_tables probe also fires.',
  },
  {
    id: 'default_error_page_leak',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'integration_bug',
    defaultSeverity: 'medium',
    title: 'Framework version / stack trace leaked on error',
    description:
      'Triggers a 404 or 500 and inspects the response for framework version banners, stack traces, or absolute file paths that AI builders commonly leave on.',
  },
  {
    id: 'exposed_debug_endpoints',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'integration_bug',
    defaultSeverity: 'medium',
    title: 'Development / debug endpoint reachable in production',
    description:
      'Probes for a small list of well-known development endpoints (Next.js dev overlay, Prisma Studio, GraphQL introspection, etc.) that should not be reachable in production builds.',
  },
  {
    id: 'insecure_cors_on_api_routes',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'integration_bug',
    defaultSeverity: 'medium',
    title: 'Permissive CORS on API routes',
    description:
      'Sends an OPTIONS preflight from a foreign origin to the discovered API base and flags wildcard `Access-Control-Allow-Origin: *` on endpoints that may handle user data.',
  },
  {
    id: 'missing_rls_on_public_tables',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'missing_rls',
    defaultSeverity: 'critical',
    title: 'Public table readable without authentication via Supabase anon key',
    description:
      'When a Supabase anon key is found in the bundle, OracleBot fetches the project\'s PostgREST OpenAPI schema and attempts a single LIMIT-1 read against each exposed table. Tables that return rows have no Row Level Security gate — anyone visiting the site can read user data.',
  },
];

let registered = false;
export function registerAiBuiltAppsProbes(): void {
  if (registered) return;
  for (const probe of PROBES) registerProbe(probe);
  registered = true;
}

// ────────────────────────────────────────────────────────────────────────────
// Scan entry point
// ────────────────────────────────────────────────────────────────────────────

export interface AiBuiltAppsScanOpts {
  targetUrl: string;
  /** Abort signal — passed to fetch so the run-cancel button works promptly. */
  signal?: AbortSignal;
}

/**
 * Run the ai_built_apps scan. Yields findings as they're discovered. The
 * scan is best-effort — individual probe failures are logged but never
 * abort the whole pack (a broken probe shouldn't hide the rest).
 */
export async function* runAiBuiltAppsScan(
  opts: AiBuiltAppsScanOpts,
): AsyncGenerator<RawFinding> {
  const { targetUrl, signal } = opts;
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return;
  }

  // Fetch the homepage once and reuse for bundle discovery.
  let homepageHtml = '';
  try {
    const res = await safeFetch(target.toString(), { signal });
    if (res?.ok) homepageHtml = await res.text();
  } catch {
    // If we can't fetch the homepage, the rest of the scan still has value.
  }

  // 1. & 2. — bundle scans. Both reuse the discovered scripts so we only
  // download each bundle once.
  const scripts = extractScriptUrls(homepageHtml, target);
  const bundles = await fetchBundles(scripts, signal, /* maxBundles */ 8);

  for await (const finding of probeHardcodedSecrets(bundles)) yield finding;

  // Discover Supabase credentials once and feed both Supabase probes from
  // it — saves bundle scans and keeps the two findings in sync.
  const supabase = discoverSupabaseCredentials(bundles);
  if (supabase) {
    for await (const finding of probeSupabaseAnonKey(supabase)) yield finding;
    // 6. — RLS probe (Phase 11 Pass B). Skipped if no Supabase creds were
    // found, so it costs nothing on non-Supabase apps.
    for await (const finding of probeMissingRls(supabase, signal)) yield finding;
  }

  // 3. — error page leak
  for await (const finding of probeDefaultErrorPage(target, signal)) yield finding;

  // 4. — debug endpoints
  for await (const finding of probeExposedDebugEndpoints(target, signal)) yield finding;

  // 5. — CORS on API routes
  for await (const finding of probeInsecureCors(target, signal)) yield finding;
}

// ────────────────────────────────────────────────────────────────────────────
// Bundle helpers
// ────────────────────────────────────────────────────────────────────────────

interface BundleSnapshot {
  url: string;
  body: string;
}

/** Pull <script src="..."> URLs out of an HTML document. */
function extractScriptUrls(html: string, base: URL): string[] {
  const out: string[] = [];
  const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      out.push(new URL(match[1], base).toString());
    } catch {
      // ignore unparseable
    }
  }
  // Same-origin only — we don't fetch third-party CDN scripts.
  return out.filter((u) => {
    try {
      return new URL(u).origin === base.origin;
    } catch {
      return false;
    }
  });
}

async function fetchBundles(
  urls: string[],
  signal: AbortSignal | undefined,
  maxBundles: number,
): Promise<BundleSnapshot[]> {
  const results: BundleSnapshot[] = [];
  for (const url of urls.slice(0, maxBundles)) {
    try {
      const res = await safeFetch(url, { signal });
      if (!res?.ok) continue;
      const body = await res.text();
      // Skip empty / source map / non-JS responses
      if (body.length < 32) continue;
      results.push({ url, body });
    } catch {
      // skip individual failures
    }
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────────────
// Probe 1 — hardcoded_secret_in_bundle
// ────────────────────────────────────────────────────────────────────────────

interface SecretPattern {
  name: string;
  /** Regex with one capture group for the secret itself (used for fingerprinting). */
  re: RegExp;
}

// Patterns chosen from each provider's published key format docs. We deliberately
// require enough surrounding context (prefix + length) that bare base64 strings
// don't false-positive. Fingerprints (first 4 + last 4 chars) appear in findings;
// the full secret never leaves the worker process.
const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'OpenAI API key', re: /\b(sk-(?:proj-)?[A-Za-z0-9_-]{40,})\b/g },
  { name: 'Anthropic API key', re: /\b(sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{60,})\b/g },
  { name: 'Stripe live secret key', re: /\b(sk_live_[A-Za-z0-9]{24,})\b/g },
  { name: 'Stripe live restricted key', re: /\b(rk_live_[A-Za-z0-9]{24,})\b/g },
  { name: 'GitHub personal access token', re: /\b(ghp_[A-Za-z0-9]{36,})\b/g },
  { name: 'GitHub OAuth token', re: /\b(gho_[A-Za-z0-9]{36,})\b/g },
  { name: 'GitHub fine-grained PAT', re: /\b(github_pat_[A-Za-z0-9_]{80,})\b/g },
  { name: 'Resend API key', re: /\b(re_[A-Za-z0-9]{20,}_[A-Za-z0-9]{20,})\b/g },
  { name: 'AWS access key id', re: /\b(AKIA[0-9A-Z]{16})\b/g },
  { name: 'Google API key', re: /\b(AIza[0-9A-Za-z_-]{35})\b/g },
];

async function* probeHardcodedSecrets(
  bundles: BundleSnapshot[],
): AsyncGenerator<RawFinding> {
  // Track unique fingerprints so we don't emit one finding per bundle.
  const seen = new Set<string>();

  for (const bundle of bundles) {
    for (const pattern of SECRET_PATTERNS) {
      pattern.re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.re.exec(bundle.body)) !== null) {
        const secret = match[1];
        const fp = fingerprint(secret);
        const key = `${pattern.name}:${fp}`;
        if (seen.has(key)) continue;
        seen.add(key);
        yield {
          severity: 'critical',
          category: 'exposed_secret',
          probeId: 'hardcoded_secret_in_bundle',
          title: `${pattern.name} exposed in client bundle`,
          description: `A ${pattern.name} (${fp}) was embedded in a client-side JavaScript bundle. Anyone visiting the site can extract it and use it to impersonate the application. Server-side keys must be referenced through a backend route, not shipped to the browser.`,
          reproJson: {
            steps: [
              `Open ${bundle.url} in a browser`,
              'Search for the matching prefix in the bundle source',
              'Verify the key works against the provider API',
            ],
            impactedPath: bundle.url,
            secretFingerprint: fp,
            provider: pattern.name,
          },
          remediation:
            'Move the key to a server-side environment variable. If the client truly needs to reach the provider, proxy the request through a backend route that authenticates and rate-limits per user.',
        };
      }
    }
  }
}

/** Public fingerprint shown in findings — never the raw secret. */
function fingerprint(secret: string): string {
  if (secret.length < 12) return `${secret.slice(0, 2)}…${secret.slice(-2)}`;
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Probe 2 — supabase_anon_key_exposed
// ────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL_RE = /\bhttps:\/\/([a-z0-9-]+)\.supabase\.co\b/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g;

interface SupabaseCredentials {
  project: string;
  jwt: string;
  /** URL of the bundle the credentials were found in (for repro steps). */
  foundIn: string;
}

/**
 * Walk the bundles once and pick out the first Supabase project URL +
 * adjacent JWT we find. Both Supabase probes (anon-key exposed and
 * missing-RLS) read from this single discovery.
 */
function discoverSupabaseCredentials(
  bundles: BundleSnapshot[],
): SupabaseCredentials | null {
  let project: string | null = null;
  let jwt: string | null = null;
  let foundIn: string | null = null;

  for (const bundle of bundles) {
    if (!project) {
      SUPABASE_URL_RE.lastIndex = 0;
      const m = SUPABASE_URL_RE.exec(bundle.body);
      if (m) {
        project = m[1];
        foundIn = bundle.url;
      }
    }
    if (!jwt) {
      JWT_RE.lastIndex = 0;
      const m = JWT_RE.exec(bundle.body);
      if (m) jwt = m[0];
    }
    if (project && jwt) break;
  }

  if (!project || !jwt || !foundIn) return null;
  return { project, jwt, foundIn };
}

async function* probeSupabaseAnonKey(
  creds: SupabaseCredentials,
): AsyncGenerator<RawFinding> {
  yield {
    severity: 'high',
    category: 'client_key_leak',
    probeId: 'supabase_anon_key_exposed',
    title: `Supabase anon key shipped to the browser (project ${creds.project})`,
    description:
      'A Supabase project URL and a JWT-shaped anon key were found in the client bundle. The anon key is intended to be public — its safety depends entirely on Row Level Security being correctly configured on every table the project exposes. The missing_rls_on_public_tables probe runs next to confirm RLS is in place.',
    reproJson: {
      steps: [
        `Open ${creds.foundIn}`,
        `Search for "${creds.project}.supabase.co"`,
        'Verify the adjacent JWT-shaped value is the anon key',
      ],
      impactedPath: creds.foundIn,
      supabaseProject: creds.project,
      jwtFingerprint: fingerprint(creds.jwt),
    },
    remediation:
      'Confirm Row Level Security is enabled on every table the anon key can reach, and that policies match the access patterns your app intends. If RLS is off, the anon key alone is enough to read or write user data from any browser.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe 6 — missing_rls_on_public_tables (Phase 11 Pass B)
//
// Reuses the Supabase credentials discovered above. PostgREST exposes
// every Supabase project's schema at GET /rest/v1/ (with the anon key).
// We pull the table list from that OpenAPI doc and attempt a LIMIT-1
// SELECT against each. Only reads. We never POST / DELETE / mutate.
// ────────────────────────────────────────────────────────────────────────────

/** Caps to keep a runaway schema from blowing up scan time. */
const RLS_MAX_TABLES = 25;
const RLS_TABLE_TIMEOUT_MS = 5_000;

async function* probeMissingRls(
  creds: SupabaseCredentials,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  const base = `https://${creds.project}.supabase.co/rest/v1`;
  const headers = {
    apikey: creds.jwt,
    Authorization: `Bearer ${creds.jwt}`,
    Accept: 'application/openapi+json, application/json',
  } as const;

  // 1. Pull the OpenAPI schema. PostgREST returns it from the rest root.
  let schema: unknown;
  try {
    const res = await safeFetch(`${base}/`, { signal, headers });
    if (!res?.ok) return;
    schema = await res.json();
  } catch {
    return;
  }

  const tables = extractTablesFromOpenApi(schema).slice(0, RLS_MAX_TABLES);
  if (tables.length === 0) return;

  // 2. For each table, attempt an unauthenticated read with the anon JWT.
  // Read-only `GET ?limit=1`. Findings keyed by table; we never include
  // row contents in the finding — only counts and column names.
  const exposed: { table: string; rowCount: number; columnNames: string[] }[] = [];
  const possiblyFiltered: string[] = [];

  for (const table of tables) {
    if (signal?.aborted) break;
    try {
      const res = await safeFetch(`${base}/${encodeURIComponent(table)}?limit=1`, {
        signal,
        headers: { ...headers, 'Range-Unit': 'items', Range: '0-0' },
      });
      if (!res) continue;
      if (res.status === 401 || res.status === 403) continue; // RLS working
      if (res.status >= 400) continue; // 404 / etc — table not exposed
      const body = (await res.json().catch(() => null)) as unknown;
      if (!Array.isArray(body)) continue;
      if (body.length === 0) {
        possiblyFiltered.push(table);
        continue;
      }
      // Strip values; keep only column names so we never persist user data.
      const first = body[0];
      const columnNames =
        first && typeof first === 'object' ? Object.keys(first as object) : [];
      exposed.push({ table, rowCount: body.length, columnNames });
    } catch {
      // ignore individual failures
    }
  }

  // 3. Emit findings. One critical-aggregate per project for tables that
  // actually returned data; one info finding for tables that returned
  // empty arrays (ambiguous — could be RLS filtering or genuinely empty).
  if (exposed.length > 0) {
    const tableNames = exposed.map((e) => e.table).slice(0, 8);
    yield {
      severity: 'critical',
      category: 'missing_rls',
      probeId: 'missing_rls_on_public_tables',
      title: `Anonymous read access to ${exposed.length} Supabase table${exposed.length === 1 ? '' : 's'}`,
      description: `Using the anon key from the client bundle, OracleBot was able to read rows from ${exposed.length} table${exposed.length === 1 ? '' : 's'} without any authentication. This means Row Level Security is either disabled or its policies allow anonymous access. Affected tables: ${tableNames.join(', ')}${exposed.length > 8 ? ` (+${exposed.length - 8} more)` : ''}.`,
      reproJson: {
        steps: [
          `Extract anon key from ${creds.foundIn}`,
          `Call GET ${base}/<table>?limit=1 with apikey: <key>`,
          'Observe HTTP 200 + non-empty array',
        ],
        impactedPath: base,
        supabaseProject: creds.project,
        // Schema fingerprint only — we never persist row values.
        exposedTables: exposed.map((e) => ({
          table: e.table,
          rowsReturned: e.rowCount,
          columns: e.columnNames,
        })),
      },
      remediation:
        "Enable Row Level Security on every public table (`ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;`) and add policies that match your intended access patterns. Run `select relname from pg_class where relrowsecurity = false and relkind = 'r';` in Supabase SQL Editor to find tables still missing RLS.",
    };
  }

  if (possiblyFiltered.length > 0) {
    // Lower severity — empty array is ambiguous (genuinely empty vs RLS-filtered).
    yield {
      severity: 'info',
      category: 'missing_rls',
      probeId: 'missing_rls_on_public_tables',
      title: `${possiblyFiltered.length} Supabase table${possiblyFiltered.length === 1 ? '' : 's'} reachable but returned no rows`,
      description: `These tables responded HTTP 200 to an anonymous query but returned an empty array. Either Row Level Security is filtering them (good) or the tables are simply empty. Worth a manual check: ${possiblyFiltered.slice(0, 8).join(', ')}${possiblyFiltered.length > 8 ? ` (+${possiblyFiltered.length - 8} more)` : ''}.`,
      reproJson: {
        steps: [
          `Call GET ${base}/<table>?limit=1 with apikey: <key>`,
          'Observe HTTP 200 + empty array',
        ],
        impactedPath: base,
        supabaseProject: creds.project,
        ambiguousTables: possiblyFiltered,
      },
      remediation:
        'Insert a test row into each table and re-run OracleBot. If any table starts returning data anonymously, RLS is missing or misconfigured. If responses stay empty, RLS is working as intended.',
    };
  }
}

/**
 * Pull table names out of a PostgREST OpenAPI document. Definitions live
 * under `definitions` (Swagger 2) or `components.schemas` (OpenAPI 3); we
 * accept either to be tolerant of PostgREST version differences.
 */
function extractTablesFromOpenApi(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const obj = schema as Record<string, unknown>;
  const out = new Set<string>();
  const v2 = obj.definitions;
  if (v2 && typeof v2 === 'object') {
    for (const name of Object.keys(v2 as Record<string, unknown>)) {
      // Skip pseudo definitions PostgREST emits for RPC etc.
      if (name && !name.startsWith('(') && !name.includes('.')) out.add(name);
    }
  }
  const v3 = (obj.components as Record<string, unknown> | undefined)?.schemas;
  if (v3 && typeof v3 === 'object') {
    for (const name of Object.keys(v3 as Record<string, unknown>)) {
      if (name && !name.startsWith('(') && !name.includes('.')) out.add(name);
    }
  }
  // Final fallback: paths.
  const paths = obj.paths;
  if (paths && typeof paths === 'object') {
    for (const p of Object.keys(paths as Record<string, unknown>)) {
      const m = p.match(/^\/([^/{}]+)$/);
      if (m && !m[1].startsWith('rpc')) out.add(m[1]);
    }
  }
  return [...out];
}

// Re-bind RLS-specific timeout used by the safeFetch we already export.
// Kept symbolic for future tuning without touching every call site.
void RLS_TABLE_TIMEOUT_MS;

// ────────────────────────────────────────────────────────────────────────────
// Probe 3 — default_error_page_leak
// ────────────────────────────────────────────────────────────────────────────

const ERROR_PAGE_PATHS = [
  '/__oraclebot_does_not_exist__',
  '/.env',
  '/api/__oraclebot_probe__',
];

const LEAK_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'Next.js stack frame', re: /__nextjs_original-stack-frame|next\/dist\/server/i },
  { label: 'Vite error overlay', re: /vite-error-overlay|@vite\/client/i },
  { label: 'Express stack trace', re: /at \w+ \([^)]+\.js:\d+:\d+\)/ },
  { label: 'Absolute filesystem path', re: /\b\/Users\/[A-Za-z0-9_.-]+\/|\/home\/[A-Za-z0-9_.-]+\/|\bC:\\\\[A-Za-z0-9_.-]+\\\\/ },
  { label: 'Framework version banner', re: /(Powered by|Express|Fastify|Hono)\b[^<\n]{0,40}\d+\.\d+\.\d+/i },
];

async function* probeDefaultErrorPage(
  target: URL,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  const seen = new Set<string>();

  for (const path of ERROR_PAGE_PATHS) {
    try {
      const url = new URL(path, target).toString();
      const res = await safeFetch(url, { signal });
      if (!res) continue;
      // Only inspect 4xx/5xx — a 200 here is its own finding handled by debug-endpoints.
      if (res.status < 400) continue;
      const body = (await res.text()).slice(0, 8_000);
      for (const { label, re } of LEAK_PATTERNS) {
        if (seen.has(label)) continue;
        if (!re.test(body)) continue;
        seen.add(label);
        yield {
          severity: 'medium',
          category: 'integration_bug',
          probeId: 'default_error_page_leak',
          title: `Error response leaks ${label}`,
          description: `Requesting ${path} returned an HTTP ${res.status} with ${label} content visible in the response body. Default framework error pages help attackers fingerprint the stack and locate vulnerable versions.`,
          reproJson: {
            steps: [`GET ${url}`, `Observe HTTP ${res.status} response includes ${label}`],
            impactedPath: path,
          },
          remediation:
            'Configure a custom error page (Next.js `app/error.tsx`, Express custom error middleware, etc.) that returns a generic message. In production builds set `NODE_ENV=production` so frameworks suppress dev-only stack traces.',
        };
        break; // one finding per path is enough
      }
    } catch {
      // ignore network failures per path
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Probe 4 — exposed_debug_endpoints
// ────────────────────────────────────────────────────────────────────────────

interface DebugEndpoint {
  path: string;
  /** A predicate that confirms the endpoint actually IS the debug surface,
   *  not a 200 from a catch-all route or marketing page. */
  confirm: (body: string, status: number) => boolean;
  label: string;
}

const DEBUG_ENDPOINTS: DebugEndpoint[] = [
  {
    path: '/__nextjs_original-stack-frame',
    label: 'Next.js dev overlay endpoint',
    confirm: (b) => /missing|not found|filename/i.test(b) || b.length < 200,
  },
  {
    path: '/_next/data/development/index.json',
    label: 'Next.js development data route',
    confirm: (_b, s) => s === 200,
  },
  {
    path: '/api/debug',
    label: 'Generic /api/debug endpoint',
    confirm: (b) => /debug|env|version|build/i.test(b),
  },
  {
    path: '/__prisma',
    label: 'Prisma Studio path',
    confirm: (b) => /prisma/i.test(b),
  },
  {
    path: '/graphql',
    label: 'GraphQL endpoint with introspection',
    confirm: (b) => /__schema|queryType|mutationType/i.test(b),
  },
];

async function* probeExposedDebugEndpoints(
  target: URL,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  for (const ep of DEBUG_ENDPOINTS) {
    try {
      const url = new URL(ep.path, target).toString();
      const res = await safeFetch(url, { signal });
      if (!res) continue;
      if (res.status >= 400) continue;
      const body = (await res.text()).slice(0, 4_000);
      if (!ep.confirm(body, res.status)) continue;
      yield {
        severity: 'medium',
        category: 'integration_bug',
        probeId: 'exposed_debug_endpoints',
        title: `${ep.label} reachable in production`,
        description: `${ep.path} returned HTTP ${res.status} with content matching the ${ep.label} signature. Development surfaces can leak source paths, environment hints, schema shape, and sometimes credentials.`,
        reproJson: {
          steps: [`GET ${url}`, `Observe HTTP ${res.status}`],
          impactedPath: ep.path,
        },
        remediation:
          'Block the path in production with a route guard, reverse-proxy rule, or framework configuration (e.g. disable GraphQL introspection on prod, gate Prisma Studio behind auth, ship production Next.js builds).',
      };
    } catch {
      // ignore
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Probe 5 — insecure_cors_on_api_routes
// ────────────────────────────────────────────────────────────────────────────

const API_PROBE_PATHS = ['/api/', '/api/health', '/api/me', '/api/user'];

async function* probeInsecureCors(
  target: URL,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  const seen = new Set<string>();

  for (const path of API_PROBE_PATHS) {
    try {
      const url = new URL(path, target).toString();
      const res = await safeFetch(url, {
        signal,
        method: 'OPTIONS',
        headers: {
          Origin: 'https://oraclebot-cors-probe.invalid',
          'Access-Control-Request-Method': 'POST',
        },
      });
      if (!res) continue;
      const acao = res.headers.get('access-control-allow-origin');
      const acac = res.headers.get('access-control-allow-credentials');
      if (!acao) continue;

      const wildcard = acao === '*';
      const reflected = acao === 'https://oraclebot-cors-probe.invalid';
      if (!wildcard && !reflected) continue;

      // Don't double-report the same misconfiguration on every path.
      const fp = `${acao}:${acac ?? ''}`;
      if (seen.has(fp)) continue;
      seen.add(fp);

      const dangerous = (wildcard && acac === 'true') || (reflected && acac === 'true');
      yield {
        severity: dangerous ? 'high' : 'medium',
        category: 'integration_bug',
        probeId: 'insecure_cors_on_api_routes',
        title: dangerous
          ? `Dangerous CORS: ${acao} with credentials enabled`
          : `Permissive CORS: ${wildcard ? 'wildcard origin' : 'origin reflection'} on API routes`,
        description: dangerous
          ? `The API responded to a preflight from a foreign origin with Access-Control-Allow-Origin: ${acao} AND Access-Control-Allow-Credentials: true. Browsers normally reject this combination, but it indicates a misconfiguration where any origin can be allowed to send credentialed requests if the response logic is changed.`
          : `The API responded to a preflight from a foreign origin with Access-Control-Allow-Origin: ${acao}. ${wildcard ? 'Wildcard origin' : 'Origin reflection without an allowlist'} means any site can call the API from a user's browser. This is acceptable only for fully public read-only APIs.`,
        reproJson: {
          steps: [
            `OPTIONS ${url}`,
            `Origin: https://oraclebot-cors-probe.invalid`,
            `Response: Access-Control-Allow-Origin: ${acao}${acac ? `, Access-Control-Allow-Credentials: ${acac}` : ''}`,
          ],
          impactedPath: path,
        },
        remediation:
          'Replace the wildcard / reflection with an explicit allowlist of trusted origins. Never combine Access-Control-Allow-Origin: * with Allow-Credentials: true.',
      };
    } catch {
      // ignore network failures
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Shared fetch helper — short timeout, AbortSignal support, swallowed errors.
// ────────────────────────────────────────────────────────────────────────────

const PROBE_TIMEOUT_MS = 8_000;

async function safeFetch(
  url: string,
  init: RequestInit & { signal?: AbortSignal } = {},
): Promise<Response | null> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  init.signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'manual',
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'OracleBot/1.0 (+https://oraclebot.net)',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', onAbort);
  }
}
