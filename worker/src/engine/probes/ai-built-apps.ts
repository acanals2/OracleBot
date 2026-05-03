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
  {
    id: 'firebase_rules_open',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'missing_rls',
    defaultSeverity: 'critical',
    title: 'Firestore / Realtime Database readable without authentication',
    description:
      'When a Firebase config (apiKey + projectId) is found in the bundle, OracleBot probes Firestore via REST for a small list of common collection names. Collections that return documents to anonymous reads have no security rules gate.',
  },
  {
    id: 'missing_rate_limit_on_auth',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'rate_limit_gap',
    defaultSeverity: 'high',
    title: 'No rate limit on auth endpoints',
    description:
      'Sends 30 concurrent POSTs to a small list of well-known auth paths (/api/auth/sign-in, /api/login, NextAuth credentials, etc.) with bogus credentials. If no 429s appear and most requests complete, the endpoint is brute-forceable.',
  },
  {
    id: 'client_side_auth_only',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'auth_gap',
    defaultSeverity: 'high',
    title: 'API route returns user-shaped data without authentication',
    description:
      'Pulls fetch() / axios calls to internal /api/* routes out of the bundle, then attempts each one without cookies. Routes that return user-shaped JSON anonymously are likely gated only by client-side conditional renders.',
  },
  {
    id: 'unvalidated_redirect',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'integration_bug',
    defaultSeverity: 'high',
    title: 'Auth/login route forwards to attacker-controlled URL',
    description:
      'Probes common auth/login routes with a `?redirect=` / `?next=` / `?return_to=` parameter pointing to a foreign origin. Flags when the response 30x-redirects to the foreign URL or its HTML body location-replaces to it. Open redirects on auth routes enable phishing flows that survive the "is this a real login page?" check.',
  },
  {
    id: 'missing_csrf_protection',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'integration_bug',
    defaultSeverity: 'high',
    title: 'State-mutating POST accepted without CSRF token',
    description:
      'Sends cross-origin POST requests to discovered API routes (with a foreign Origin header) carrying minimal but valid-shaped bodies. Flags 200 responses on routes that should be CSRF-gated. AI-codegen apps frequently miss CSRF protection on Next.js / Express / Hono API routes.',
  },
  {
    id: 'dependency_with_known_cve',
    pack: 'ai_built_apps',
    engine: 'site',
    category: 'integration_bug',
    defaultSeverity: 'medium',
    title: 'Client bundle contains a library version with a known CVE',
    description:
      'Pattern-matches the client bundle for version strings of well-known JS libraries with high-impact published CVEs (jQuery, lodash, axios, dompurify, marked, Next.js). Useful as a fast first-pass; does not replace a full SCA tool but catches the most common AI-codegen miss: shipping with whatever version was current 6+ months ago.',
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
    // 6. — RLS probe. Skipped if no Supabase creds were found, so it costs
    // nothing on non-Supabase apps.
    for await (const finding of probeMissingRls(supabase, signal)) yield finding;
  }

  // 7. — Firebase rules. Same shape as the Supabase probe — only fires if
  // we find a Firebase config in the bundle.
  const firebase = discoverFirebaseCredentials(bundles);
  if (firebase) {
    for await (const finding of probeFirebaseRulesOpen(firebase, signal)) yield finding;
  }

  // 3. — error page leak
  for await (const finding of probeDefaultErrorPage(target, signal)) yield finding;

  // 4. — debug endpoints
  for await (const finding of probeExposedDebugEndpoints(target, signal)) yield finding;

  // 8. — auth rate limit. Independent of bundle contents.
  for await (const finding of probeMissingRateLimitOnAuth(target, signal)) yield finding;

  // 9. — client-side-only auth. Reuses bundle list to find /api/* refs.
  for await (const finding of probeClientSideAuthOnly(target, bundles, signal)) yield finding;

  // 10. — open redirect on auth routes (Pass C).
  for await (const finding of probeUnvalidatedRedirect(target, signal)) yield finding;

  // 11. — CSRF on /api/* routes pulled from the bundle (Pass C).
  for await (const finding of probeMissingCsrfProtection(target, bundles, signal)) yield finding;

  // 12. — known-vulnerable library versions in the bundle (Pass C).
  for await (const finding of probeDependencyWithKnownCve(bundles)) yield finding;

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
// Probe 7 — firebase_rules_open
//
// Same shape as the Supabase RLS probe but for Firebase. Pulls the project's
// apiKey + projectId out of the bundle and probes Firestore via REST for a
// small list of well-known collection names. Read-only; only GETs.
// ────────────────────────────────────────────────────────────────────────────

interface FirebaseCredentials {
  apiKey: string;
  projectId: string;
  foundIn: string;
}

// AIza* keys + projectId follow Google's published format. Either of these
// formats can appear in the bundle: a literal config object, or a JSON-stringified
// initializeApp call. We accept both and require BOTH apiKey and projectId
// before treating the discovery as positive.
const FIREBASE_API_KEY_RE = /\b(AIza[0-9A-Za-z_-]{35})\b/g;
const FIREBASE_PROJECT_ID_RE = /["']?projectId["']?\s*[:=]\s*["']([a-z][a-z0-9-]{4,29})["']/g;

const FIREBASE_PROBE_COLLECTIONS = [
  'users',
  'accounts',
  'profiles',
  'posts',
  'messages',
  'orders',
  'invoices',
  'documents',
  'files',
  'sessions',
];

function discoverFirebaseCredentials(
  bundles: BundleSnapshot[],
): FirebaseCredentials | null {
  let apiKey: string | null = null;
  let projectId: string | null = null;
  let foundIn: string | null = null;

  for (const bundle of bundles) {
    if (!apiKey) {
      FIREBASE_API_KEY_RE.lastIndex = 0;
      const m = FIREBASE_API_KEY_RE.exec(bundle.body);
      if (m) {
        apiKey = m[1];
        foundIn = bundle.url;
      }
    }
    if (!projectId) {
      FIREBASE_PROJECT_ID_RE.lastIndex = 0;
      const m = FIREBASE_PROJECT_ID_RE.exec(bundle.body);
      if (m) projectId = m[1];
    }
    if (apiKey && projectId) break;
  }

  if (!apiKey || !projectId || !foundIn) return null;
  return { apiKey, projectId, foundIn };
}

async function* probeFirebaseRulesOpen(
  creds: FirebaseCredentials,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  const base = `https://firestore.googleapis.com/v1/projects/${creds.projectId}/databases/(default)/documents`;
  const exposed: { collection: string; documentCount: number }[] = [];

  for (const collection of FIREBASE_PROBE_COLLECTIONS) {
    if (signal?.aborted) break;
    try {
      const url = `${base}/${encodeURIComponent(collection)}?pageSize=1&key=${encodeURIComponent(creds.apiKey)}`;
      const res = await safeFetch(url, { signal });
      if (!res) continue;
      // 401 / 403 / 404 → rules working OR collection doesn't exist
      if (res.status >= 400) continue;
      const body = (await res.json().catch(() => null)) as { documents?: unknown[] } | null;
      if (!body || !Array.isArray(body.documents)) continue;
      if (body.documents.length === 0) continue;
      exposed.push({ collection, documentCount: body.documents.length });
    } catch {
      // ignore individual collection errors
    }
  }

  if (exposed.length === 0) return;

  yield {
    severity: 'critical',
    category: 'missing_rls',
    probeId: 'firebase_rules_open',
    title: `Anonymous read access to ${exposed.length} Firestore collection${exposed.length === 1 ? '' : 's'}`,
    description: `Using the Firebase API key from the client bundle, OracleBot read documents from ${exposed.length} collection${exposed.length === 1 ? '' : 's'} without authentication. Firebase security rules are missing or permissive — anyone visiting the site can read this data.`,
    reproJson: {
      steps: [
        `Extract API key from ${creds.foundIn}`,
        `GET ${base}/<collection>?pageSize=1&key=<apiKey>`,
        'Observe HTTP 200 with non-empty `documents` array',
      ],
      impactedPath: base,
      firebaseProject: creds.projectId,
      exposedCollections: exposed,
    },
    remediation:
      "In firestore.rules, restrict reads to authenticated users at minimum: `match /{document=**} { allow read, write: if request.auth != null; }`. Tighten further per-collection. Same applies to Realtime Database and Storage rules.",
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe 8 — missing_rate_limit_on_auth
//
// Bursts 30 concurrent POSTs against well-known auth paths with bogus
// credentials. We expect either a 429 (good) or a steady stream of 401/422
// (acceptable but worth flagging if no 429s appear at all). The presence
// of 200 responses is suspect on any of these — flagged separately by the
// existing api_unauthenticated_500 probe.
// ────────────────────────────────────────────────────────────────────────────

const AUTH_PATHS = [
  '/api/auth/sign-in',
  '/api/auth/signin',
  '/api/auth/login',
  '/api/login',
  '/api/sign-in',
  '/api/auth/callback/credentials',
];

const AUTH_BURST_SIZE = 30;
const AUTH_BURST_WINDOW_MS = 5_000;

async function* probeMissingRateLimitOnAuth(
  target: URL,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  // Step 1 — discover which path actually exists. POSTing 30 times to every
  // candidate would be wasteful; we send one OPTIONS / HEAD probe first and
  // burst the first path that responds to a known-bad POST with anything
  // other than 404.
  let path: string | null = null;
  for (const candidate of AUTH_PATHS) {
    if (signal?.aborted) return;
    try {
      const url = new URL(candidate, target).toString();
      const res = await safeFetch(url, {
        signal,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'oraclebot-probe@invalid', password: 'oraclebot-probe' }),
      });
      if (!res) continue;
      if (res.status !== 404) {
        path = candidate;
        break;
      }
    } catch {
      // ignore
    }
  }
  if (!path) return;

  // Step 2 — burst.
  const url = new URL(path, target).toString();
  const start = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: AUTH_BURST_SIZE }, () =>
      safeFetch(url, {
        signal,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: `oraclebot-probe-${Math.random().toString(36).slice(2, 8)}@invalid`,
          password: 'oraclebot-probe',
        }),
      }),
    ),
  );
  const elapsed = Date.now() - start;
  const statuses = results
    .map((r) => (r.status === 'fulfilled' && r.value ? r.value.status : 0))
    .filter((s) => s > 0);
  if (statuses.length === 0) return;

  const has429 = statuses.includes(429);
  const accepted = statuses.filter((s) => s < 500 && s !== 429).length;
  if (has429) return; // good — real rate limit in place
  if (accepted < AUTH_BURST_SIZE * 0.7) return; // server gave up before us — not a clean signal

  yield {
    severity: 'high',
    category: 'rate_limit_gap',
    probeId: 'missing_rate_limit_on_auth',
    title: `No rate limit on ${path} (${accepted}/${AUTH_BURST_SIZE} requests in ${Math.round(elapsed)}ms)`,
    description: `${AUTH_BURST_SIZE} concurrent login attempts with bogus credentials produced ${accepted} non-rate-limited responses in ${Math.round(elapsed)}ms. No 429s were returned. The endpoint is brute-forceable — an attacker can enumerate emails or guess passwords without throttle.`,
    reproJson: {
      steps: [
        `Send ${AUTH_BURST_SIZE} concurrent POSTs to ${url} with random bogus credentials`,
        `Observe ${accepted} non-429 responses in ${Math.round(elapsed)}ms`,
      ],
      impactedPath: path,
      statusCounts: countBy(statuses),
    },
    remediation:
      'Add per-IP and per-email rate limiting to auth endpoints (e.g. `@upstash/ratelimit` for Next.js, `express-rate-limit` for Express). Return 429 with `Retry-After`. Couple with CAPTCHA on repeated failures.',
  };
  // Mark elapsed as referenced for budget tuning later.
  void AUTH_BURST_WINDOW_MS;
}

function countBy(items: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[String(i)] = (out[String(i)] ?? 0) + 1;
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Probe 9 — client_side_auth_only
//
// Many AI-codegen apps protect routes by conditionally rendering them in
// the client (e.g. `if (!user) return <SignIn />`) but never guard the
// underlying API with server-side middleware. We pull internal /api/*
// route references out of the bundle and call each one without cookies.
// Routes that respond 200 with user-shaped JSON are flagged.
// ────────────────────────────────────────────────────────────────────────────

const API_ROUTE_RE = /["'`]\/api\/[a-zA-Z0-9_./-]+["'`]/g;
const CLIENT_AUTH_MAX_ROUTES = 12;

// Heuristic: a JSON body that looks like it contains user-specific data
// based on common field names. Imperfect but conservative.
const USER_SHAPED_FIELDS = ['email', 'userId', 'id', 'username', 'profile', 'sessionId', 'role', 'createdAt'];

async function* probeClientSideAuthOnly(
  target: URL,
  bundles: BundleSnapshot[],
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  // Extract unique /api/* paths from all bundles.
  const paths = new Set<string>();
  for (const bundle of bundles) {
    API_ROUTE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = API_ROUTE_RE.exec(bundle.body)) !== null) {
      const raw = m[0].slice(1, -1); // strip quote
      // Skip auth paths (already covered by probes 8 + api_unauthenticated_500)
      // and OracleBot's own paths if scanning ourselves.
      if (raw.includes('/auth/') || raw.startsWith('/api/auth')) continue;
      if (raw.includes('/badge/') || raw.includes('/score/')) continue;
      // Strip dynamic segments like /api/users/${id} that won't resolve.
      if (raw.includes('${') || raw.includes('+ ')) continue;
      paths.add(raw);
    }
  }

  const candidates = [...paths].slice(0, CLIENT_AUTH_MAX_ROUTES);
  if (candidates.length === 0) return;

  const exposed: { path: string; fields: string[] }[] = [];

  for (const path of candidates) {
    if (signal?.aborted) break;
    try {
      const url = new URL(path, target).toString();
      const res = await safeFetch(url, { signal });
      if (!res) continue;
      // Anything other than 200 means the server is at least gating it.
      if (res.status !== 200) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) continue;
      const body = (await res.json().catch(() => null)) as unknown;
      const fields = userShapedFields(body);
      if (fields.length === 0) continue;
      exposed.push({ path, fields });
    } catch {
      // ignore
    }
  }

  if (exposed.length === 0) return;

  yield {
    severity: 'high',
    category: 'auth_gap',
    probeId: 'client_side_auth_only',
    title: `${exposed.length} API route${exposed.length === 1 ? '' : 's'} return user-shaped data without authentication`,
    description: `OracleBot extracted /api/* references from the client bundle, then called each one without any cookies or authorization headers. ${exposed.length} route${exposed.length === 1 ? '' : 's'} returned 200 with JSON containing user-shaped fields (${[...new Set(exposed.flatMap((e) => e.fields))].slice(0, 5).join(', ')}). The auth gate may be client-side only — easily bypassed with curl.`,
    reproJson: {
      steps: [
        'Extract /api/* references from the client bundle',
        `GET <each route> with no cookies / no Authorization header`,
        'Observe 200 + user-shaped JSON',
      ],
      impactedPath: exposed.map((e) => e.path).join(', '),
      exposedRoutes: exposed,
    },
    remediation:
      'Add server-side auth middleware that runs BEFORE the route handler returns data. In Next.js: protect the API route handler with `getServerSession()` + early-return 401. In Express: add an `authRequired` middleware on the router. Never rely on client-side conditional rendering as the security boundary.',
  };
}

function userShapedFields(body: unknown): string[] {
  const seen: string[] = [];
  function visit(v: unknown, depth: number) {
    if (depth > 3 || seen.length > 8) return;
    if (Array.isArray(v)) {
      for (const item of v.slice(0, 3)) visit(item, depth + 1);
      return;
    }
    if (v && typeof v === 'object') {
      for (const key of Object.keys(v as object)) {
        if (USER_SHAPED_FIELDS.includes(key) && !seen.includes(key)) seen.push(key);
        visit((v as Record<string, unknown>)[key], depth + 1);
      }
    }
  }
  visit(body, 0);
  return seen;
}

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

// ────────────────────────────────────────────────────────────────────────────
// Probe 10 — unvalidated_redirect
//
// Probes well-known auth-route patterns with a foreign-origin `?redirect=`
// / `?next=` / `?return_to=` parameter. Detection is two-pronged:
//   - HTTP 30x with Location pointing at the foreign origin
//   - HTML body that does location.replace() / window.location = to it
// ────────────────────────────────────────────────────────────────────────────

const REDIRECT_ROUTES = ['/login', '/sign-in', '/auth/login', '/api/auth/signin', '/oauth/authorize'];
const REDIRECT_PARAM_NAMES = ['redirect', 'redirect_to', 'redirectTo', 'next', 'return_to', 'returnTo', 'callbackUrl', 'continue'];
const REDIRECT_FOREIGN = 'https://oraclebot-redirect-canary.invalid';
const REDIRECT_LOCATION_PATTERN = new RegExp(
  `(?:location\\.(?:href|replace)\\s*=|<meta[^>]+url=)\\s*['"]?${REDIRECT_FOREIGN}`,
  'i',
);

async function* probeUnvalidatedRedirect(
  target: URL,
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  const hits: { route: string; param: string; via: 'http-30x' | 'html-body' }[] = [];
  const seen = new Set<string>();

  for (const path of REDIRECT_ROUTES) {
    if (signal?.aborted) break;
    for (const param of REDIRECT_PARAM_NAMES) {
      const url = new URL(path, target);
      url.searchParams.set(param, REDIRECT_FOREIGN);
      try {
        const res = await safeFetch(url.toString(), { signal });
        if (!res) continue;
        const key = `${path}:${param}`;
        if (seen.has(key)) continue;
        // HTTP-redirect path: 30x with Location pointing at the foreign origin.
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location') ?? '';
          if (loc.startsWith(REDIRECT_FOREIGN) || loc === REDIRECT_FOREIGN) {
            hits.push({ route: path, param, via: 'http-30x' });
            seen.add(key);
            continue;
          }
        }
        // HTML-body path: search for the canary URL in client-side redirect code.
        if (res.status >= 200 && res.status < 300) {
          const ct = res.headers.get('content-type') ?? '';
          if (!ct.includes('html')) continue;
          const body = (await res.text()).slice(0, 16_000);
          if (REDIRECT_LOCATION_PATTERN.test(body)) {
            hits.push({ route: path, param, via: 'html-body' });
            seen.add(key);
          }
        }
      } catch {
        // ignore individual failures
      }
    }
  }

  if (hits.length === 0) return;

  yield {
    severity: 'high',
    category: 'integration_bug',
    probeId: 'unvalidated_redirect',
    title: `${hits.length} auth route${hits.length === 1 ? '' : 's'} forward to attacker-controlled URLs`,
    description: `OracleBot probed ${REDIRECT_ROUTES.length} common auth paths with foreign-origin redirect parameters. ${hits.length} route+param combination${hits.length === 1 ? '' : 's'} forwarded to the canary URL — meaning an attacker can craft links of the form \`https://your-app.com${hits[0]?.route}?${hits[0]?.param}=https://evil.test\` that complete the legit login flow then dump the user on a phishing page.`,
    reproJson: {
      steps: [
        `GET <route>?<param>=${REDIRECT_FOREIGN}`,
        'Observe HTTP 30x with foreign Location header OR HTML body redirecting to the foreign URL',
      ],
      impactedPath: hits.map((h) => h.route).join(', '),
      hits,
    },
    remediation:
      'Validate redirect targets against an allowlist. Accept only same-origin paths or a small set of pre-approved external destinations. Reject any redirect parameter that resolves to a different host. Treat redirect-target validation as security-critical, not UX-critical.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe 11 — missing_csrf_protection
//
// Cross-origin POST to discovered /api/* routes with a foreign Origin
// header. Flags 200 responses (NOT 401/403/400) — those mean the route
// processed the cross-origin write without a CSRF gate.
//
// Important nuance: many AI-codegen API routes don't have CSRF protection
// because they expect Bearer auth, not cookies. We only flag routes where
// the response BODY suggests a state mutation actually happened (an id,
// "created", "ok", etc.) — not 200 + an empty body.
// ────────────────────────────────────────────────────────────────────────────

const CSRF_PROBE_BODY = JSON.stringify({
  oraclebot_csrf_probe: true,
  // Random bogus payload that's unlikely to validate against a real schema.
  email: 'oraclebot-csrf-probe@invalid.test',
  name: 'OracleBot CSRF Probe',
});
const CSRF_FOREIGN_ORIGIN = 'https://oraclebot-csrf-canary.invalid';
const CSRF_MUTATION_PATTERNS: RegExp[] = [
  /"(?:id|_id|uuid)"\s*:\s*"[a-zA-Z0-9_-]+"/,
  /"(?:created|inserted|added|updated)"\s*:/i,
  /"status"\s*:\s*"(?:created|ok|success)"/i,
];

async function* probeMissingCsrfProtection(
  target: URL,
  bundles: BundleSnapshot[],
  signal: AbortSignal | undefined,
): AsyncGenerator<RawFinding> {
  // Reuse the same /api/* path extraction the client_side_auth_only probe
  // uses, scoped tighter — only routes that look like state-mutators.
  const paths = new Set<string>();
  for (const bundle of bundles) {
    API_ROUTE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = API_ROUTE_RE.exec(bundle.body)) !== null) {
      const raw = m[0].slice(1, -1);
      if (raw.includes('${') || raw.includes('+ ')) continue;
      // Heuristic: routes that mention create/update/post/save/sign-up/checkout
      // are likely mutators. We deliberately don't probe /api/auth/login
      // (CSRF requires cookies; login is unauthenticated by design).
      if (raw.includes('/auth/') || raw.includes('/login')) continue;
      if (/(create|update|delete|post|save|signup|sign-up|checkout|invite|publish|edit)/i.test(raw)) {
        paths.add(raw);
      }
    }
  }
  const candidates = [...paths].slice(0, 8);
  if (candidates.length === 0) return;

  const exploitable: { path: string; status: number; signals: string[] }[] = [];
  for (const path of candidates) {
    if (signal?.aborted) break;
    try {
      const url = new URL(path, target).toString();
      const res = await safeFetch(url, {
        signal,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: CSRF_FOREIGN_ORIGIN,
          referer: CSRF_FOREIGN_ORIGIN + '/',
        },
        body: CSRF_PROBE_BODY,
      });
      if (!res) continue;
      // Only 200/201 are interesting. 401/403/400/422/500 = working as intended.
      if (res.status !== 200 && res.status !== 201) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('json')) continue;
      const body = (await res.text()).slice(0, 4_000);
      const signals: string[] = [];
      for (const pat of CSRF_MUTATION_PATTERNS) {
        if (pat.test(body)) signals.push(pat.source.slice(0, 40));
      }
      if (signals.length === 0) continue;
      exploitable.push({ path, status: res.status, signals });
    } catch {
      // ignore
    }
  }

  if (exploitable.length === 0) return;

  yield {
    severity: 'high',
    category: 'integration_bug',
    probeId: 'missing_csrf_protection',
    title: `${exploitable.length} state-mutating route${exploitable.length === 1 ? '' : 's'} accept cross-origin POSTs`,
    description: `OracleBot pulled mutation-shaped /api/* routes from the bundle and POSTed to each from a foreign Origin header. ${exploitable.length} route${exploitable.length === 1 ? '' : 's'} returned 200/201 with response bodies indicating successful state changes. If user sessions are cookie-based, a malicious site can trigger these mutations whenever your user has an active session.`,
    reproJson: {
      steps: [
        'POST to <route> with Origin: ' + CSRF_FOREIGN_ORIGIN,
        'Observe 200/201 with response body suggesting the mutation succeeded',
      ],
      impactedPath: exploitable.map((e) => e.path).join(', '),
      exploitable,
    },
    remediation:
      'Add CSRF protection on cookie-authenticated mutation routes: a same-origin check, a SameSite=Strict session cookie, or a CSRF token verified server-side. If your routes are Bearer-authenticated only (not cookies), document that explicitly so reviewers can verify.',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Probe 12 — dependency_with_known_cve
//
// Pattern-matches client bundles for version strings of high-impact JS
// libraries with published CVEs. Curated list — not a substitute for a
// full SCA tool, but catches the most common AI-codegen miss: shipping
// with whatever version was current 6+ months ago.
//
// Each entry pairs a regex that captures the version with a function that
// decides whether the version is vulnerable. We deliberately under-flag
// (only flag when sure) to keep severity-correctness high.
// ────────────────────────────────────────────────────────────────────────────

interface CveCheck {
  /** Library name shown in findings. */
  name: string;
  /** Regex with group 1 = the version string. */
  re: RegExp;
  /** Vulnerable predicate. Returns the CVE id if vuln, null if safe. */
  vulnerable: (version: string) => string | null;
}

const CVE_CHECKS: CveCheck[] = [
  {
    name: 'jQuery',
    re: /jQuery\s+v?(\d+\.\d+\.\d+)/,
    vulnerable: (v) => (semverLt(v, '3.5.0') ? 'CVE-2020-11022 / CVE-2020-11023 (XSS via untrusted HTML)' : null),
  },
  {
    name: 'lodash',
    re: /lodash[^"']*?["']version["']\s*[:=]\s*["'](\d+\.\d+\.\d+)["']/,
    vulnerable: (v) => (semverLt(v, '4.17.21') ? 'CVE-2021-23337 (command injection in template)' : null),
  },
  {
    name: 'axios',
    re: /axios[^"']*?["']?version["']?\s*[:=]\s*["'](\d+\.\d+\.\d+)["']/,
    vulnerable: (v) => (semverLt(v, '1.6.0') ? 'CVE-2023-45857 (CSRF via XSRF-TOKEN echo)' : null),
  },
  {
    name: 'DOMPurify',
    re: /DOMPurify\s*=\s*\{[^}]*version\s*:\s*["'](\d+\.\d+\.\d+)["']/,
    vulnerable: (v) => (semverLt(v, '3.0.9') ? 'CVE-2024-26908 (mXSS bypass)' : null),
  },
  {
    name: 'marked',
    re: /marked[^"']*?["']?version["']?\s*[:=]\s*["'](\d+\.\d+\.\d+)["']/,
    vulnerable: (v) => (semverLt(v, '4.0.10') ? 'CVE-2022-21680 / CVE-2022-21681 (ReDoS)' : null),
  },
  {
    name: 'Next.js',
    re: /next-[a-z0-9]+\/_buildManifest\.js[\s\S]*?version["']?\s*[:=]\s*["'](\d+\.\d+\.\d+)/,
    vulnerable: (v) => (semverLt(v, '14.2.10') ? 'CVE-2024-46982 (cache poisoning) and others' : null),
  },
];

async function* probeDependencyWithKnownCve(
  bundles: BundleSnapshot[],
): AsyncGenerator<RawFinding> {
  const hits: { library: string; version: string; cve: string; foundIn: string }[] = [];
  const seen = new Set<string>();

  for (const bundle of bundles) {
    for (const check of CVE_CHECKS) {
      check.re.lastIndex = 0;
      const m = check.re.exec(bundle.body);
      if (!m) continue;
      const version = m[1];
      const cve = check.vulnerable(version);
      if (!cve) continue;
      const dedupe = `${check.name}:${version}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      hits.push({ library: check.name, version, cve, foundIn: bundle.url });
    }
  }

  if (hits.length === 0) return;

  yield {
    severity: 'medium',
    category: 'integration_bug',
    probeId: 'dependency_with_known_cve',
    title: `${hits.length} client-side librar${hits.length === 1 ? 'y has' : 'ies have'} known CVEs`,
    description: `OracleBot pattern-matched the client bundle for high-impact JS libraries with published vulnerabilities. ${hits.map((h) => `${h.library} ${h.version}`).join(', ')}. Update to a patched version. Note: this probe checks a small curated list of high-impact libraries; for a complete SCA pass run a tool like Snyk or npm audit on your package-lock.json.`,
    reproJson: {
      steps: [
        'Open the client bundle in a browser',
        'Search for the library version string',
        'Cross-reference against the linked CVE',
      ],
      hits,
    },
    remediation:
      'Update the flagged libraries to a patched version. Add a regular `npm audit` step to your CI. For Lovable/v0/Bolt projects, regenerate the project to pick up newer base templates with current dependencies.',
  };
}

/** Tiny semver-lt helper — full enough for x.y.z comparisons but not for ranges. */
function semverLt(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai < bi) return true;
    if (ai > bi) return false;
  }
  return false;
}
