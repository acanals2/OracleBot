/**
 * Site Mode engine.
 *
 * Launches min(botCount, 5) concurrent Playwright Chromium browsers against
 * the target URL. Each browser emulates a persona and interacts with the site:
 *
 *   1. Navigate to root
 *   2. Discover forms + interactive elements
 *   3. Ask Claude (haiku) to generate adversarial inputs for each form
 *   4. Submit the form, record response / console errors
 *   5. Click through navigation links
 *
 * Findings emitted in real-time:
 *   - integration_bug    JS console errors
 *   - auth_gap           Non-2xx on form submit when unauthenticated
 *   - race_condition     Concurrent submission → duplicate/inconsistent responses
 *   - latency_cascade    Response > 3 s
 *   - malformed_input    Server-side 500 on adversarial input
 *
 * BotTick emitted every TICK_INTERVAL_MS with aggregated real metrics.
 */
import { chromium, type Browser, type Page } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';
import type { EngineOpts, EngineEvent, BotTick, RawFinding } from './types.js';

const TICK_INTERVAL_MS = 5_000;
const MAX_CONCURRENT_BOTS = 5;
const SLOW_RESPONSE_THRESHOLD_MS = 3_000;

interface RequestSample {
  durationMs: number;
  status: number;
  url: string;
  timestamp: number;
}

interface BotState {
  activeBots: number;
  samples: RequestSample[];
  findings: RawFinding[];
}

async function getAdversarialInputs(
  anthropic: Anthropic,
  formHtml: string,
  persona: string,
): Promise<Record<string, string>> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `You are testing a web form as a ${persona} user. Generate adversarial form inputs that probe for XSS, SQL injection, auth bypass, and broken validation.

Form HTML:
${formHtml.substring(0, 2000)}

Respond with a JSON object mapping field names to adversarial values. Only respond with valid JSON, nothing else.
Example: {"email": "test@test.com' OR 1=1--", "name": "<script>alert(1)</script>"}`,
        },
      ],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}';
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    // Fallback inputs if Claude unavailable
    return {
      email: "test@test.com'--",
      name: '<script>alert(1)</script>',
      query: "' OR '1'='1",
      input: '../../../etc/passwd',
    };
  }
}

async function runBot(
  browser: Browser,
  targetUrl: string,
  persona: string,
  isAdversarial: boolean,
  anthropic: Anthropic,
  state: BotState,
  durationMs: number,
): Promise<void> {
  let page: Page | null = null;
  const deadline = Date.now() + durationMs;

  try {
    page = await browser.newPage();

    // Capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        state.findings.push({
          severity: 'medium',
          category: 'integration_bug',
          title: `JS console error: ${msg.text().substring(0, 120)}`,
          description: `Browser console error detected during ${persona} persona session. URL: ${page?.url() ?? targetUrl}`,
          reproJson: {
            steps: [`Navigate to ${targetUrl}`, 'Observe browser console'],
            impactedPath: page?.url() ?? targetUrl,
            affectedPersonas: [persona],
          },
          remediation: 'Fix the JavaScript error to prevent client-side failures and potential information leakage.',
        });
      }
    });

    // Track network requests — record start time on request, compute duration on response
    const requestStartTimes = new Map<string, number>();
    page.on('request', (req) => {
      requestStartTimes.set(req.url(), Date.now());
    });

    page.on('response', (response) => {
      const req = response.request();
      const start = requestStartTimes.get(req.url()) ?? Date.now();
      const durationMs = Date.now() - start;
      requestStartTimes.delete(req.url());

      state.samples.push({
        durationMs,
        status: response.status(),
        url: req.url(),
        timestamp: Date.now(),
      });

      if (durationMs > SLOW_RESPONSE_THRESHOLD_MS) {
        state.findings.push({
          severity: 'medium',
          category: 'latency_cascade',
          title: `Slow response: ${new URL(req.url()).pathname} took ${Math.round(durationMs)}ms`,
          description: `A request to ${new URL(req.url()).pathname} took ${Math.round(durationMs)}ms, exceeding the ${SLOW_RESPONSE_THRESHOLD_MS}ms threshold under ${state.activeBots} concurrent bots.`,
          reproJson: {
            steps: [`Load ${targetUrl}`, `Wait for ${req.url()}`],
            impactedPath: new URL(req.url()).pathname,
          },
          remediation: 'Profile the endpoint and add caching or query optimization. Consider a CDN for static assets.',
        });
      }
    });

    while (Date.now() < deadline) {
      try {
        // Navigate to target
        const navStart = Date.now();
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        const navDuration = Date.now() - navStart;
        state.samples.push({
          durationMs: navDuration,
          status: 200,
          url: targetUrl,
          timestamp: Date.now(),
        });

        if (isAdversarial) {
          // Find all forms on the page
          const forms = await page.locator('form').all();

          for (const form of forms.slice(0, 3)) {
            try {
              const formHtml = await form.innerHTML();
              const inputs = await getAdversarialInputs(anthropic, formHtml, persona);

              // Fill in adversarial values
              for (const [name, value] of Object.entries(inputs)) {
                const field = form.locator(`[name="${name}"], [id="${name}"]`).first();
                if (await field.count() > 0) {
                  await field.fill(String(value)).catch(() => null);
                }
              }

              // Submit and check response
              const submitStart = Date.now();
              const [response] = await Promise.allSettled([
                page.waitForResponse((r) => r.url().includes(new URL(targetUrl).hostname), {
                  timeout: 10_000,
                }),
                form.locator('[type="submit"], button[type="submit"], button').first().click(),
              ]);

              const submitDuration = Date.now() - submitStart;

              if (response.status === 'fulfilled') {
                const res = response.value;
                if (res.status() >= 500) {
                  state.findings.push({
                    severity: 'high',
                    category: 'malformed_input',
                    title: `Server error on adversarial form input (HTTP ${res.status()})`,
                    description: `Submitting adversarial inputs to a form on ${new URL(targetUrl).pathname} caused HTTP ${res.status()}. Server should validate and reject bad input gracefully.`,
                    reproJson: {
                      steps: [
                        `Navigate to ${targetUrl}`,
                        `Fill form with: ${JSON.stringify(inputs).substring(0, 300)}`,
                        'Submit form',
                        `Observe HTTP ${res.status()}`,
                      ],
                      impactedPath: new URL(res.url()).pathname,
                      affectedPersonas: [persona],
                    },
                    remediation: 'Add server-side input validation. Never return 500 on user input; return 400/422 with an error message.',
                  });
                }

                if (res.status() === 401 || res.status() === 403) {
                  // Expected — auth is working
                } else if (res.status() === 200 && inputs['email']?.includes("'")) {
                  // Got 200 with SQL injection attempt — potential auth gap
                  state.findings.push({
                    severity: 'critical',
                    category: 'auth_gap',
                    title: 'Possible auth bypass: SQL injection input returned 200',
                    description: `Submitting "${inputs['email']}" to a login/auth form returned HTTP 200. This may indicate SQL injection vulnerability or missing input sanitization.`,
                    reproJson: {
                      steps: [
                        `Navigate to ${targetUrl}`,
                        `Set email field to: ${inputs['email']}`,
                        'Submit form',
                        'Observe HTTP 200 — expected 401 or 400',
                      ],
                      impactedPath: new URL(res.url()).pathname,
                      affectedPersonas: [persona],
                    },
                    remediation: 'Use parameterized queries. Never interpolate user input into SQL. Add rate limiting to auth endpoints.',
                  });
                }

                if (submitDuration > SLOW_RESPONSE_THRESHOLD_MS) {
                  state.samples.push({
                    durationMs: submitDuration,
                    status: res.status(),
                    url: res.url(),
                    timestamp: Date.now(),
                  });
                }
              }
            } catch {
              // Form interaction failed — not a finding, just noisy
            }
          }

          // Click through nav links
          const links = await page.locator('nav a, header a').all();
          for (const link of links.slice(0, 5)) {
            try {
              const href = await link.getAttribute('href');
              if (href && href.startsWith('/') && !href.includes('#')) {
                const clickStart = Date.now();
                await page.goto(new URL(href, targetUrl).toString(), {
                  waitUntil: 'domcontentloaded',
                  timeout: 10_000,
                });
                state.samples.push({
                  durationMs: Date.now() - clickStart,
                  status: 200,
                  url: new URL(href, targetUrl).toString(),
                  timestamp: Date.now(),
                });
              }
            } catch {
              // Ignore navigation errors
            }
          }
        }

        // Pause between interaction cycles
        await new Promise((r) => setTimeout(r, 2_000));
      } catch {
        // Page error — retry after brief pause
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
  } finally {
    await page?.close().catch(() => null);
  }
}

function aggregateTick(
  state: BotState,
  tSeconds: number,
  windowMs: number,
): BotTick {
  const cutoff = Date.now() - windowMs;
  const windowSamples = state.samples.filter((s) => s.timestamp > cutoff);

  const rps = windowSamples.length / (windowMs / 1000);

  const sorted = windowSamples.map((s) => s.durationMs).sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const errorCount = windowSamples.filter((s) => s.status >= 400).length;
  const errorRate = windowSamples.length > 0 ? errorCount / windowSamples.length : 0;

  return {
    tSeconds,
    activeBots: state.activeBots,
    rps,
    p50Ms: p50,
    p95Ms: p95,
    p99Ms: p99,
    errorRate,
  };
}

async function checkRaceCondition(
  browser: Browser,
  targetUrl: string,
  state: BotState,
): Promise<void> {
  // Simultaneously submit the same form from N pages and look for inconsistencies
  const RACE_COUNT = 8;
  const pages: Page[] = [];

  try {
    await Promise.all(
      Array.from({ length: RACE_COUNT }, async (_, i) => {
        const p = await browser.newPage();
        pages.push(p);
        await p.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null);
      }),
    );

    const forms = await pages[0]?.locator('form').all();
    if (!forms?.length) return;

    const form = forms[0];
    const formHtml = await form.innerHTML();

    // Fill all pages with the same data
    const testEmail = `race-test-${Date.now()}@oraclebot.test`;
    for (const p of pages) {
      const emailField = p.locator('[type="email"], [name="email"]').first();
      if (await emailField.count() > 0) {
        await emailField.fill(testEmail).catch(() => null);
      }
    }

    // Fire all submits simultaneously
    const results = await Promise.allSettled(
      pages.map((p) =>
        Promise.race([
          p.locator('[type="submit"], button').first().click(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8_000)),
        ]),
      ),
    );

    const successCount = results.filter((r) => r.status === 'fulfilled').length;

    // If we got multiple successes for the same email, possible race condition
    if (successCount > 1) {
      state.findings.push({
        severity: 'high',
        category: 'race_condition',
        title: `Race condition: ${successCount}/${RACE_COUNT} concurrent submissions succeeded`,
        description: `${successCount} simultaneous form submissions with the same data all returned success. This may allow duplicate records, double-charges, or inventory discrepancies under high concurrency.`,
        reproJson: {
          steps: [
            `Open ${RACE_COUNT} browser tabs`,
            `Navigate all tabs to ${targetUrl}`,
            `Fill all forms with the same email: ${testEmail}`,
            'Submit all forms simultaneously',
            `Observe ${successCount} successful responses`,
          ],
          impactedPath: new URL(targetUrl).pathname,
        },
        remediation: 'Add idempotency keys and database-level unique constraints. Use optimistic locking or a distributed mutex for critical operations.',
      });
    }
  } finally {
    await Promise.all(pages.map((p) => p.close().catch(() => null)));
  }
}

export async function* runSiteMode(opts: EngineOpts): AsyncGenerator<EngineEvent> {
  const { run, targetUrl, durationMs, anthropicApiKey } = opts;
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const botCount = Math.min(run.botCount, MAX_CONCURRENT_BOTS);
  const intentMix = run.intentMix ?? { adversarial: 0.6, friendly: 0.4 };
  const adversarialCount = Math.ceil(botCount * (intentMix.adversarial ?? 0.6));

  const state: BotState = {
    activeBots: 0,
    samples: [],
    findings: [],
  };

  let browser: Browser | null = null;
  const emittedFindingTitles = new Set<string>();

  try {
    browser = await chromium.launch({ headless: true });

    // Run race condition check upfront
    try {
      await checkRaceCondition(browser, targetUrl, state);
    } catch {
      // Race check is best-effort
    }

    // Launch bot tasks
    const botTasks: Promise<void>[] = [];
    for (let i = 0; i < botCount; i++) {
      const isAdversarial = i < adversarialCount;
      const persona = isAdversarial ? 'hostile adversarial' : 'casual friendly';
      state.activeBots++;
      const task = runBot(browser, targetUrl, persona, isAdversarial, anthropic, state, durationMs).finally(
        () => {
          state.activeBots--;
        },
      );
      botTasks.push(task);
    }

    // Emit ticks every TICK_INTERVAL_MS while bots run
    const startTime = Date.now();
    const tickCount = Math.floor(durationMs / TICK_INTERVAL_MS);
    const racePromise = Promise.allSettled(botTasks);

    for (let tick = 0; tick < tickCount; tick++) {
      await new Promise((r) => setTimeout(r, TICK_INTERVAL_MS));
      const tSeconds = Math.round((Date.now() - startTime) / 1000);
      yield aggregateTick(state, tSeconds, TICK_INTERVAL_MS * 2);

      // Surface any new findings collected since last tick
      for (const finding of state.findings) {
        if (!emittedFindingTitles.has(finding.title)) {
          emittedFindingTitles.add(finding.title);
          yield finding;
        }
      }
    }

    await racePromise;

    // Final flush of any remaining findings
    for (const finding of state.findings) {
      if (!emittedFindingTitles.has(finding.title)) {
        emittedFindingTitles.add(finding.title);
        yield finding;
      }
    }
  } finally {
    await browser?.close().catch(() => null);
  }
}
