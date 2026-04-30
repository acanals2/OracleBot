/**
 * Sandbox provisioner.
 *
 * Given a Run's target configuration, returns a SandboxHandle with a
 * public-facing URL the bot engines can hit. Supports four target types:
 *
 *   targetLiveUrl        → no-op; return URL as-is
 *   targetAgentEndpoint  → no-op; return URL as-is
 *   targetRepoUrl        → E2B microVM: git clone → npm install → next dev
 *   targetDockerImage    → E2B microVM: docker pull → docker run
 *
 * When E2B_API_KEY is absent and the target is a repo/docker image, throws
 * with a clear message so the developer knows what to configure.
 */
import { Sandbox } from '@e2b/code-interpreter';
import type { SandboxHandle, Run } from './types.js';

const PROVISION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 3_000;
const NEXT_DEV_PORT = 3000;

/**
 * Poll a URL until it returns HTTP 2xx, or until the timeout elapses.
 */
async function pollUntilReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.ok || res.status < 500) return;
    } catch {
      // not ready yet — keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Sandbox target ${url} did not become ready within ${timeoutMs / 1000}s`);
}

/**
 * Provision a sandbox from a GitHub repo URL.
 * Clones the repo, installs dependencies, starts `next dev`, and returns the
 * public tunnel URL once the dev server responds.
 */
async function provisionFromRepo(
  repoUrl: string,
  commitSha: string | null,
  apiKey: string,
): Promise<SandboxHandle> {
  const sandbox = await Sandbox.create({
    apiKey,
    timeoutMs: PROVISION_TIMEOUT_MS,
  });

  // Clone repo into /app
  const cloneCmd = commitSha
    ? `git clone --depth 1 ${repoUrl} /app && cd /app && git fetch --depth 1 origin ${commitSha} && git checkout ${commitSha}`
    : `git clone --depth 1 ${repoUrl} /app`;

  const cloneResult = await sandbox.commands.run(cloneCmd, {
    timeoutMs: 120_000,
  });
  if (cloneResult.exitCode !== 0) {
    await sandbox.kill();
    throw new Error(`git clone failed (exit ${cloneResult.exitCode}): ${cloneResult.stderr}`);
  }

  // Install dependencies
  const installResult = await sandbox.commands.run(
    'cd /app && npm install --prefer-offline 2>&1',
    { timeoutMs: 180_000 },
  );
  if (installResult.exitCode !== 0) {
    await sandbox.kill();
    throw new Error(`npm install failed: ${installResult.stderr}`);
  }

  // Start next dev in the background (background:true returns process without waiting)
  await sandbox.commands.run(
    `cd /app && PORT=${NEXT_DEV_PORT} npx next dev -p ${NEXT_DEV_PORT} 2>&1`,
    { background: true } as Parameters<typeof sandbox.commands.run>[1],
  );

  const host = sandbox.getHost(NEXT_DEV_PORT);
  const targetUrl = `https://${host}`;

  await pollUntilReady(targetUrl, PROVISION_TIMEOUT_MS);

  return {
    targetUrl,
    async stop() {
      await sandbox.kill();
    },
  };
}

/**
 * Provision a sandbox from a Docker image.
 * Pulls the image and runs it on port 3000.
 */
async function provisionFromDocker(
  image: string,
  apiKey: string,
): Promise<SandboxHandle> {
  const sandbox = await Sandbox.create({
    apiKey,
    timeoutMs: PROVISION_TIMEOUT_MS,
  });

  // Pull image then run it
  const runResult = await sandbox.commands.run(
    `docker pull ${image} && docker run -d -p ${NEXT_DEV_PORT}:${NEXT_DEV_PORT} ${image}`,
    { timeoutMs: 180_000 },
  );
  if (runResult.exitCode !== 0) {
    await sandbox.kill();
    throw new Error(`Docker setup failed: ${runResult.stderr}`);
  }

  const host = sandbox.getHost(NEXT_DEV_PORT);
  const targetUrl = `https://${host}`;

  await pollUntilReady(targetUrl, PROVISION_TIMEOUT_MS);

  return {
    targetUrl,
    async stop() {
      await sandbox.kill();
    },
  };
}

/** No-op handle for live URLs — the target already exists. */
function liveHandle(url: string): SandboxHandle {
  return {
    targetUrl: url,
    async stop() {
      // nothing to tear down
    },
  };
}

/**
 * Main entry point: provision a sandbox (or return a live URL handle) based
 * on the run's target configuration.
 */
export async function provisionSandbox(run: Run): Promise<SandboxHandle> {
  // Live URL or agent endpoint — no sandbox needed
  if (run.targetLiveUrl) {
    return liveHandle(run.targetLiveUrl);
  }
  if (run.targetAgentEndpoint) {
    return liveHandle(run.targetAgentEndpoint);
  }

  // Repo or Docker image — needs E2B
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    throw new Error(
      'E2B_API_KEY is required to provision a sandbox for repo/docker targets. ' +
        'Set it in your environment or use a targetLiveUrl instead.',
    );
  }

  if (run.targetRepoUrl) {
    return provisionFromRepo(run.targetRepoUrl, run.targetCommitSha ?? null, apiKey);
  }

  if (run.targetDockerImage) {
    return provisionFromDocker(run.targetDockerImage, apiKey);
  }

  throw new Error(
    'Run has no target configured (targetLiveUrl, targetAgentEndpoint, targetRepoUrl, or targetDockerImage).',
  );
}
