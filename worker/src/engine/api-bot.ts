/**
 * API Mode engine.
 *
 * Probes an HTTP API for security and reliability issues:
 *
 *   1. Discover endpoints via OpenAPI/Swagger spec (if available)
 *   2. Test each endpoint with malformed inputs (wrong types, missing fields, oversize)
 *   3. Test authentication enforcement (no token → expect 401, not 500)
 *   4. Burst test for rate limiting (50 RPS → expect 429)
 *   5. Check CORS headers for overly-permissive configuration
 *
 * Findings:
 *   - rate_limit_gap    No 429 on burst
 *   - auth_gap          Non-auth endpoint returns 500/200 when 401 expected
 *   - malformed_input   Server 500 on bad input
 *   - integration_bug   CORS wildcard or missing security headers
 *
 * BotTick emitted every TICK_INTERVAL_MS with real rps + latency.
 */
import type { EngineOpts, EngineEvent, BotTick, RawFinding } from './types.js';
import { logger } from '../logger.js';

const TICK_INTERVAL_MS = 5_000;
const RATE_LIMIT_BURST = 50;
const RATE_LIMIT_WINDOW_MS = 2_000;

interface RequestSample {
  durationMs: number;
  status: number;
  url: string;
  timestamp: number;
}

interface ApiState {
  samples: RequestSample[];
  findings: RawFinding[];
}

// ── OpenAPI discovery ─────────────────────────────────────────────────────────

const SPEC_PATHS = [
  '/openapi.json',
  '/openapi.yaml',
  '/swagger.json',
  '/swagger/v1/swagger.json',
  '/api-docs',
  '/api/openapi.json',
  '/v1/openapi.json',
  '/docs/openapi.json',
];

interface OpenApiEndpoint {
  path: string;
  method: string;
  params: { name: string; in: string; required?: boolean; schema?: { type?: string } }[];
  requestBodySchema?: Record<string, unknown>;
}

async function discoverEndpoints(baseUrl: string): Promise<OpenApiEndpoint[]> {
  for (const specPath of SPEC_PATHS) {
    try {
      const res = await fetch(`${baseUrl}${specPath}`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) continue;

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('json') && !contentType.includes('yaml')) continue;

      const spec = await res.json().catch(() => null) as Record<string, unknown> | null;
      if (!spec || typeof spec.paths !== 'object' || !spec.paths) continue;

      const endpoints: OpenApiEndpoint[] = [];
      for (const [path, methods] of Object.entries(spec.paths as Record<string, Record<string, unknown>>)) {
        for (const [method, operation] of Object.entries(methods)) {
          if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
          const op = operation as {
            parameters?: { name: string; in: string; required?: boolean; schema?: { type?: string } }[];
            requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> };
          };
          endpoints.push({
            path,
            method: method.toUpperCase(),
            params: op.parameters ?? [],
            requestBodySchema: op.requestBody?.content?.['application/json']?.schema,
          });
        }
      }
      return endpoints;
    } catch {
      continue;
    }
  }

  // Fallback: probe common API paths
  return [
    { path: '/api/health', method: 'GET', params: [] },
    { path: '/api/status', method: 'GET', params: [] },
    { path: '/api/users', method: 'GET', params: [] },
    { path: '/api/v1/users', method: 'GET', params: [] },
    { path: '/health', method: 'GET', params: [] },
  ];
}

// ── Request helpers ───────────────────────────────────────────────────────────

async function probe(
  url: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string; headers: Record<string, string>; durationMs: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const resBody = await res.text().catch(() => '');
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });
    return { status: res.status, body: resBody.substring(0, 1000), headers: resHeaders, durationMs: Date.now() - start };
  } catch (err) {
    return { status: 0, body: String(err), headers: {}, durationMs: Date.now() - start };
  }
}

// ── Test suites ───────────────────────────────────────────────────────────────

async function testMalformedInputs(
  baseUrl: string,
  endpoint: OpenApiEndpoint,
  state: ApiState,
): Promise<void> {
  const url = `${baseUrl}${endpoint.path}`;

  const malformedBodies = [
    // Wrong type for every field
    { __proto__: null, id: 'not-a-number', email: 12345, name: null },
    // Oversize string
    { input: 'A'.repeat(100_000) },
    // Deeply nested
    { a: { b: { c: { d: { e: { f: { g: { h: 'deep' } } } } } } } },
    // Null body
    null,
    // Array instead of object
    [1, 2, 3],
  ];

  for (const body of malformedBodies) {
    const result = await probe(url, endpoint.method === 'GET' ? 'POST' : endpoint.method, body);
    state.samples.push({ durationMs: result.durationMs, status: result.status, url, timestamp: Date.now() });

    if (result.status >= 500) {
      state.findings.push({
        severity: 'high',
        category: 'malformed_input',
        probeId: 'api_malformed_input_500',
        title: `HTTP ${result.status} on malformed input to ${endpoint.method} ${endpoint.path}`,
        description: `Sending malformed data to ${endpoint.method} ${endpoint.path} returned HTTP ${result.status}. APIs should return 400/422 with validation errors, never 500.`,
        reproJson: {
          steps: [
            `${endpoint.method} ${url}`,
            `Body: ${JSON.stringify(body).substring(0, 200)}`,
            `Response: HTTP ${result.status}`,
          ],
          impactedPath: endpoint.path,
        },
        remediation: 'Add schema validation at the API layer (e.g. zod, joi). Return 422 with field-level error details on invalid input. Never let malformed input reach the database layer.',
      });
      return; // One finding per endpoint is enough
    }
  }
}

async function testAuthEnforcement(
  baseUrl: string,
  endpoint: OpenApiEndpoint,
  state: ApiState,
): Promise<void> {
  const url = `${baseUrl}${endpoint.path}`;

  // Hit endpoint with no auth at all
  const noAuth = await probe(url, endpoint.method);
  state.samples.push({ durationMs: noAuth.durationMs, status: noAuth.status, url, timestamp: Date.now() });

  if (noAuth.status >= 500) {
    state.findings.push({
      severity: 'high',
      category: 'auth_gap',
      probeId: 'api_unauthenticated_500',
      title: `Unauthenticated request to ${endpoint.path} returned HTTP ${noAuth.status}`,
      description: `${endpoint.method} ${endpoint.path} returned HTTP ${noAuth.status} when called without any credentials. Protected endpoints should return 401/403, never 500.`,
      reproJson: {
        steps: [`${endpoint.method} ${url} (no Authorization header)`, `Response: HTTP ${noAuth.status}`],
        impactedPath: endpoint.path,
      },
      remediation: 'Add auth middleware before your route handlers. Check for early return on missing/invalid token before any business logic runs.',
    });
  } else if (noAuth.status === 200) {
    // 200 without auth — check if this looks like a protected endpoint
    const looksProtected =
      endpoint.path.includes('/user') ||
      endpoint.path.includes('/admin') ||
      endpoint.path.includes('/account') ||
      endpoint.path.includes('/private') ||
      endpoint.path.includes('/me');

    if (looksProtected) {
      state.findings.push({
        severity: 'critical',
        category: 'auth_gap',
        probeId: 'api_unauthenticated_500',
        title: `Potentially protected endpoint ${endpoint.path} accessible without authentication`,
        description: `${endpoint.method} ${endpoint.path} returned HTTP 200 without any credentials. If this endpoint handles user data, it represents an unauthenticated data access vulnerability.`,
        reproJson: {
          steps: [`${endpoint.method} ${url} (no credentials)`, 'Response: HTTP 200 with data'],
          impactedPath: endpoint.path,
        },
        remediation: 'Ensure all endpoints that handle user-specific data require a valid session or JWT. Use middleware that verifies the token before the handler runs.',
      });
    }
  }
}

async function testRateLimit(
  baseUrl: string,
  endpoint: OpenApiEndpoint,
  state: ApiState,
): Promise<void> {
  const url = `${baseUrl}${endpoint.path}`;
  const start = Date.now();

  // Fire RATE_LIMIT_BURST requests as fast as possible
  const results = await Promise.allSettled(
    Array.from({ length: RATE_LIMIT_BURST }, () =>
      probe(url, endpoint.method),
    ),
  );

  const elapsed = Date.now() - start;
  const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
  const has429 = statuses.includes(429);
  const successCount = statuses.filter((s) => s >= 200 && s < 300).length;

  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      state.samples.push({
        durationMs: r.value.durationMs,
        status: r.value.status,
        url,
        timestamp: Date.now(),
      });
    }
  });

  if (!has429 && successCount >= RATE_LIMIT_BURST * 0.7 && elapsed < RATE_LIMIT_WINDOW_MS + 5_000) {
    state.findings.push({
      severity: 'high',
      category: 'rate_limit_gap',
      probeId: 'api_no_rate_limit',
      title: `No rate limiting on ${endpoint.method} ${endpoint.path} (${successCount}/${RATE_LIMIT_BURST} burst requests succeeded)`,
      description: `${RATE_LIMIT_BURST} requests to ${endpoint.method} ${endpoint.path} in ${Math.round(elapsed)}ms all returned success without any 429 throttling. Unprotected endpoints can be scraped, brute-forced, or used to exhaust downstream resources.`,
      reproJson: {
        steps: [
          `Send ${RATE_LIMIT_BURST} concurrent requests to ${endpoint.method} ${url}`,
          `Observe ${successCount} successes in ${Math.round(elapsed)}ms with no 429`,
        ],
        impactedPath: endpoint.path,
      },
      remediation: 'Add rate limiting middleware (e.g. express-rate-limit, upstash-ratelimit). Return 429 with Retry-After. Differentiate authenticated vs unauthenticated limits.',
    });
  }
}

async function testCorsHeaders(
  baseUrl: string,
  state: ApiState,
): Promise<void> {
  const result = await probe(baseUrl + '/', 'OPTIONS', undefined, {
    Origin: 'https://evil.example.com',
    'Access-Control-Request-Method': 'POST',
  });

  const allowOrigin = result.headers['access-control-allow-origin'];
  const allowCredentials = result.headers['access-control-allow-credentials'];

  if (allowOrigin === '*' && allowCredentials === 'true') {
    state.findings.push({
      severity: 'critical',
      category: 'auth_gap',
      probeId: 'api_cors_or_security_headers',
      title: 'Dangerous CORS: Access-Control-Allow-Origin: * with credentials=true',
      description: 'The API allows cross-origin requests from any origin while also allowing credentials. This combination is rejected by browsers but indicates a misconfiguration that can lead to CSRF or credential leakage if not immediately fixed.',
      reproJson: {
        steps: [
          `OPTIONS ${baseUrl}/ with Origin: https://evil.example.com`,
          `Response: Access-Control-Allow-Origin: * + Access-Control-Allow-Credentials: true`,
        ],
        impactedPath: '/',
      },
      remediation: "Never combine Access-Control-Allow-Origin: * with Allow-Credentials: true. Use an allowlist of trusted origins instead of wildcard.",
    });
  } else if (allowOrigin === '*') {
    state.findings.push({
      severity: 'low',
      category: 'integration_bug',
      probeId: 'api_cors_or_security_headers',
      title: 'CORS wildcard: Access-Control-Allow-Origin: * on API endpoints',
      description: "The API returns Access-Control-Allow-Origin: * on all requests. This is acceptable for fully public read-only APIs but problematic if any endpoint handles authenticated data.",
      reproJson: {
        steps: [`OPTIONS ${baseUrl}/`, 'Response includes Access-Control-Allow-Origin: *'],
        impactedPath: '/',
      },
      remediation: 'Restrict CORS to known frontend origins via an allowlist. Avoid wildcard on endpoints that touch user data.',
    });
  }
}

function aggregateTick(state: ApiState, tSeconds: number, windowMs: number): BotTick {
  const cutoff = Date.now() - windowMs;
  const window = state.samples.filter((s) => s.timestamp > cutoff);

  const rps = window.length / (windowMs / 1000);
  const sorted = window.map((s) => s.durationMs).sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const errorCount = window.filter((s) => s.status >= 400 || s.status === 0).length;
  const errorRate = window.length > 0 ? errorCount / window.length : 0;

  return {
    tSeconds,
    activeBots: 1, // API mode is single-client style
    rps,
    p50Ms: p50,
    p95Ms: p95,
    p99Ms: p99,
    errorRate,
  };
}

export async function* runApiMode(opts: EngineOpts): AsyncGenerator<EngineEvent> {
  const { run, targetUrl, durationMs } = opts;

  const state: ApiState = {
    samples: [],
    findings: [],
  };

  const emittedFindingTitles = new Set<string>();
  const startTime = Date.now();

  // Discover endpoints
  const endpoints = await discoverEndpoints(targetUrl);
  logger.info({ event: 'api_bot.endpoints_discovered', count: endpoints.length }, 'api-bot endpoints discovered');

  // CORS check upfront
  await testCorsHeaders(targetUrl, state).catch(() => null);

  // Rate limit test on first meaningful endpoint
  const firstEndpoint = endpoints.find((e) => e.method === 'GET') ?? endpoints[0];
  if (firstEndpoint) {
    await testRateLimit(targetUrl, firstEndpoint, state).catch(() => null);
  }

  // Run malformed input + auth tests on discovered endpoints
  async function testAllEndpoints(): Promise<void> {
    while (Date.now() - startTime < durationMs) {
      for (const endpoint of endpoints) {
        if (Date.now() - startTime >= durationMs) break;

        await Promise.allSettled([
          testMalformedInputs(targetUrl, endpoint, state),
          testAuthEnforcement(targetUrl, endpoint, state),
        ]);

        await new Promise((r) => setTimeout(r, 500));
      }

      // Pause between full sweeps
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }

  const testTask = testAllEndpoints();
  const tickCount = Math.floor(durationMs / TICK_INTERVAL_MS);

  for (let tick = 0; tick < tickCount; tick++) {
    await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
    const tSeconds = Math.round((Date.now() - startTime) / 1000);
    yield aggregateTick(state, tSeconds, TICK_INTERVAL_MS * 2);

    for (const finding of state.findings) {
      if (!emittedFindingTitles.has(finding.title)) {
        emittedFindingTitles.add(finding.title);
        yield finding;
      }
    }
  }

  await testTask;

  for (const finding of state.findings) {
    if (!emittedFindingTitles.has(finding.title)) {
      emittedFindingTitles.add(finding.title);
      yield finding;
    }
  }
}
