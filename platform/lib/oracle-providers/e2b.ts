/**
 * E2B provider — workspace previews running in E2B microVMs.
 *
 * Each preview call spins up a dedicated E2B sandbox, uploads the workspace
 * files, installs dependencies, and starts `next dev`. The sandbox's public
 * tunnel URL is returned as the iframe source.
 *
 * Prerequisites:
 *   - npm install @e2b/code-interpreter (done)
 *   - E2B_API_KEY in environment
 *   - ORACLE_PREVIEW_PROVIDER=e2b
 *
 * Lifecycle:
 *   start()   → Sandbox.create → upload files → npm install → next dev → poll ready
 *   stop()    → sandbox.kill()
 *   isAlive() → checks module-level registry
 *
 * Concurrency: one sandbox per workspace id. Calling start() on an id that
 * already has a running sandbox stops the old one first (same semantics as
 * the local provider).
 */
import { Sandbox } from '@e2b/code-interpreter';
import fs from 'node:fs';
import path from 'node:path';
import type { PreviewProvider, PreviewStartOptions, PreviewStartResult } from './types';

const NEXT_DEV_PORT = 3000;
const PROVISION_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 3_000;

// Files/dirs to skip when uploading workspace to E2B
const UPLOAD_SKIP = new Set([
  'node_modules',
  '.next',
  '.git',
  'oracle-workspaces',
  'oracle-checkpoints',
  '.oracle-preview',
]);

const SKIP_EXTENSIONS = new Set(['.lock', '.log']);
const MAX_FILE_SIZE_BYTES = 400 * 1024; // 400 KB per file

/** Module-level registry: workspaceId → live Sandbox instance */
const activeSandboxes = new Map<string, Sandbox>();

// ── File upload helpers ───────────────────────────────────────────────────────

async function collectFiles(dir: string, base: string): Promise<{ rel: string; abs: string }[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  const results: { rel: string; abs: string }[] = [];

  for (const entry of entries) {
    if (UPLOAD_SKIP.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env.local') continue;

    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs);

    if (entry.isDirectory()) {
      const sub = await collectFiles(abs, base);
      results.push(...sub);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (SKIP_EXTENSIONS.has(ext)) continue;
      const stat = await fs.promises.stat(abs).catch(() => null);
      if (!stat || stat.size > MAX_FILE_SIZE_BYTES) continue;
      results.push({ rel, abs });
    }
  }

  return results;
}

async function uploadWorkspace(sandbox: Sandbox, workspacePath: string): Promise<void> {
  const files = await collectFiles(workspacePath, workspacePath);

  // Ensure /app directory exists
  await sandbox.commands.run('mkdir -p /app', { timeoutMs: 10_000 });

  // Upload in batches of 10 to avoid overwhelming the transport
  const BATCH = 10;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async ({ rel, abs }) => {
        const destPath = `/app/${rel}`;
        const destDir = path.posix.dirname(destPath);

        // Ensure parent dir exists
        await sandbox.commands.run(`mkdir -p ${destDir}`, { timeoutMs: 5_000 });

        // Read and upload file
        const content = await fs.promises.readFile(abs);
        await (sandbox.files as unknown as { write: (p: string, d: Buffer) => Promise<unknown> }).write(
          destPath,
          content,
        );
      }),
    );
  }
}

async function pollUntilReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok || res.status < 500) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`E2B sandbox at ${url} did not become ready within ${timeoutMs / 1000}s`);
}

// ── Provider implementation ───────────────────────────────────────────────────

export const e2bProvider: PreviewProvider = {
  name: 'e2b',

  async start(opts: PreviewStartOptions): Promise<PreviewStartResult> {
    const { id, workspacePath, hardRebuild } = opts;
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) {
      throw new Error(
        'E2B_API_KEY is not set. Either set it in .env.local or use ORACLE_PREVIEW_PROVIDER=local.',
      );
    }

    // Stop any existing sandbox for this workspace
    const existing = activeSandboxes.get(id);
    if (existing) {
      await existing.kill().catch(() => null);
      activeSandboxes.delete(id);
    }

    const sandbox = await Sandbox.create({ apiKey, timeoutMs: PROVISION_TIMEOUT_MS });
    activeSandboxes.set(id, sandbox);

    try {
      // Upload workspace files
      await uploadWorkspace(sandbox, workspacePath);

      if (hardRebuild) {
        // Clear any cached .next dir uploaded by mistake
        await sandbox.commands.run('rm -rf /app/.next', { timeoutMs: 10_000 });
      }

      // Install deps
      const installResult = await sandbox.commands.run(
        'cd /app && npm install --prefer-offline 2>&1 | tail -5',
        { timeoutMs: 180_000 },
      );
      if (installResult.exitCode !== 0) {
        throw new Error(`npm install failed in E2B sandbox: ${installResult.stderr}`);
      }

      // Start next dev in the background
      await sandbox.commands.run(
        `cd /app && PORT=${NEXT_DEV_PORT} npx next dev -p ${NEXT_DEV_PORT} 2>&1`,
        { background: true } as Parameters<typeof sandbox.commands.run>[1],
      );

      const host = sandbox.getHost(NEXT_DEV_PORT);
      const url = `https://${host}`;

      await pollUntilReady(url, PROVISION_TIMEOUT_MS);

      return { url };
    } catch (err) {
      // Clean up sandbox on failure
      await sandbox.kill().catch(() => null);
      activeSandboxes.delete(id);
      throw err;
    }
  },

  async stop(id: string): Promise<void> {
    const sandbox = activeSandboxes.get(id);
    if (!sandbox) return;
    await sandbox.kill().catch(() => null);
    activeSandboxes.delete(id);
  },

  isAlive(id: string): boolean {
    return activeSandboxes.has(id);
  },
};
