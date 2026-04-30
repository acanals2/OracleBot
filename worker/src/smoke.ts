/**
 * Container smoke test — runs inside the built image and confirms Playwright
 * Chromium boots and can fetch a real page. Used as a final acceptance gate
 * for the Dockerfile changes.
 *
 *   docker run --rm oraclebot-worker:test node dist/smoke.js
 *
 * Exits 0 on success, 1 on any failure. Keep this file dependency-light so
 * it doesn't drag in worker bootstrap (env validation, DB clients, etc.).
 */
import { chromium } from 'playwright';

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://example.com', { waitUntil: 'load', timeout: 30_000 });
    const heading = await page.locator('h1').first().textContent();
    if (!heading || !heading.includes('Example Domain')) {
      throw new Error(`unexpected h1: ${JSON.stringify(heading)}`);
    }
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ event: 'smoke.ok', heading }));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ event: 'smoke.failed', err: err?.message ?? String(err) }));
  process.exit(1);
});
