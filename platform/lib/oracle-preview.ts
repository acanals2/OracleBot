import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { getWorkspacePath } from './oracle-workspace';
import {
  CompileErrorAccumulator,
  classifyLogLine,
  isRecoveryMarker,
  isTerminalError,
  type CompileError,
} from './oracle-preview-log';
import type {
  PreviewPhase,
  PreviewState,
  PreviewStatus,
} from './oracle-preview-types';

/**
 * Per-workspace preview manager. On demand, runs `npm install` (if needed),
 * then `next dev -p <free-port>` inside the workspace. Keeps one child per
 * workspace alive until explicitly stopped or the workspace is restarted.
 *
 * Single-host process-boundary isolation only — for untrusted multi-tenant
 * traffic, swap to the E2B provider (see `lib/oracle-providers/`).
 *
 * Adapted near-verbatim from the bundle's `oracle-preview.ts`. Notable
 * preservations: idle reaper, disk-backed orphan tracking, sidecar config
 * stamping, file watcher with config-class detection, auto-restart budget.
 */

export type { PreviewStatus, PreviewPhase, PreviewState } from './oracle-preview-types';

type ChangeEvent =
  | { type: 'change'; id: string; files: string[] }
  | { type: 'rebuild'; id: string; reason: string }
  | { type: 'state'; id: string };

type PreviewRecord = PreviewState & {
  child?: ChildProcess;
  installingChild?: ChildProcess;
  watcher?: { close: () => Promise<void> | void };
  accumulator?: CompileErrorAccumulator;
  crashTimestamps?: number[];
  probeAbort?: AbortController;
};

function getRegistry(): Map<string, PreviewRecord> {
  const g = globalThis as unknown as {
    __oraclePreviewRegistry?: Map<string, PreviewRecord>;
    __oraclePreviewInit?: boolean;
  };
  if (!g.__oraclePreviewRegistry) g.__oraclePreviewRegistry = new Map();
  if (!g.__oraclePreviewInit) {
    g.__oraclePreviewInit = true;
    void reapStaleFromDisk(g.__oraclePreviewRegistry);
    installShutdownHandlers(g.__oraclePreviewRegistry);
    installIdleSweeper(g.__oraclePreviewRegistry);
  }
  return g.__oraclePreviewRegistry;
}

function installIdleSweeper(registry: Map<string, PreviewRecord>): void {
  const interval = setInterval(() => {
    const now = Date.now();
    const timeout = getIdleTimeoutMs();
    for (const rec of registry.values()) {
      if (rec.phase !== 'live' && rec.phase !== 'first-paint') continue;
      const idleFor = now - rec.lastHitAt;
      if (idleFor <= timeout) continue;
      const minutes = Math.max(1, Math.round(idleFor / 60_000));
      appendLog(rec, `⊗ reaped (idle ${minutes}m)`);
      stopPreview(rec.id);
      rec.error = IDLE_REAPED_SENTINEL;
      emitEvent({ type: 'state', id: rec.id });
    }
  }, getSweepIntervalMs());
  interval.unref?.();
}

function getEmitter(): EventEmitter {
  const g = globalThis as unknown as { __oraclePreviewEmitter?: EventEmitter };
  if (!g.__oraclePreviewEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(256);
    g.__oraclePreviewEmitter = emitter;
  }
  return g.__oraclePreviewEmitter;
}

export function subscribeToPreviewEvents(
  id: string,
  listener: (event: ChangeEvent) => void,
): () => void {
  const emitter = getEmitter();
  const handler = (event: ChangeEvent) => {
    if (event.id === id) listener(event);
  };
  emitter.on('event', handler);
  return () => emitter.off('event', handler);
}

function emitEvent(event: ChangeEvent): void {
  getEmitter().emit('event', event);
}

const PORT_RANGE_START = 4100;
const PORT_RANGE_END = 4199;
const MAX_LOG_LINES = 60;

export const IDLE_REAPED_SENTINEL = '__idle_reaped__';

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function getSweepIntervalMs(): number {
  return readPositiveIntEnv('ORACLE_PREVIEW_SWEEP_INTERVAL_MS', 60_000);
}

function getIdleTimeoutMs(): number {
  return readPositiveIntEnv('ORACLE_PREVIEW_IDLE_TIMEOUT_MS', 1_200_000);
}

function getMaxConcurrentPreviews(): number {
  return readPositiveIntEnv('ORACLE_MAX_CONCURRENT_PREVIEWS', 40);
}

const KILL_GRACE_MS = 2000;
const PROBE_DEADLINE_MS = 90_000;
const PROBE_GRACE_MS = 3_000;
const CRASH_WINDOW_MS = 60_000;
const MAX_AUTO_RESTARTS = 2;
const WATCHER_DEBOUNCE_MS = 1500;

const CONFIG_CLASS_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.json',
]);
const CONFIG_CLASS_PATTERNS = [
  /^next\.config\.[mc]?[jt]s$/,
  /^tailwind\.config\.[mc]?[jt]s$/,
  /^postcss\.config\.[mc]?[jt]s$/,
  /^app\/layout\.(t|j)sx?$/,
  /^app\/globals\.css$/,
  /^\.env(\..*)?$/,
];

function isConfigClassFile(relPath: string): boolean {
  const base = path.posix.basename(relPath);
  if (CONFIG_CLASS_FILES.has(base)) return true;
  if (CONFIG_CLASS_FILES.has(relPath)) return true;
  return CONFIG_CLASS_PATTERNS.some((re) => re.test(relPath) || re.test(base));
}

function appendLog(record: PreviewRecord, line: string) {
  record.log.push(line);
  if (record.log.length > MAX_LOG_LINES) {
    record.log.splice(0, record.log.length - MAX_LOG_LINES);
  }
}

function statusForPhase(phase: PreviewPhase): PreviewStatus {
  switch (phase) {
    case 'idle':
      return 'idle';
    case 'installing':
      return 'installing';
    case 'compiling':
      return 'starting';
    case 'first-paint':
    case 'live':
      return 'ready';
    case 'error':
      return 'error';
    case 'stopped':
      return 'stopped';
  }
}

function setPhase(rec: PreviewRecord, next: PreviewPhase, opts: { error?: string } = {}): void {
  const prior = rec.phase;
  rec.phase = next;
  rec.status = statusForPhase(next);
  if (opts.error !== undefined) rec.error = opts.error;
  if (next === 'first-paint' || next === 'live') {
    if (!rec.readyAt) rec.readyAt = new Date().toISOString();
  }
  if (prior !== next) emitEvent({ type: 'state', id: rec.id });
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(): Promise<number> {
  const used = new Set<number>();
  for (const rec of getRegistry().values()) {
    if (rec.port && rec.status !== 'stopped' && rec.status !== 'error') {
      used.add(rec.port);
    }
  }
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (used.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port in ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

interface DiskPreviewRecord {
  id: string;
  pid: number;
  port: number;
  workspacePath: string;
  startedAt: string;
}

function diskStorePath(): string {
  const dir = process.env.ORACLE_PREVIEW_STATE_DIR
    ? process.env.ORACLE_PREVIEW_STATE_DIR
    : path.join(os.tmpdir(), 'oracle-preview');
  return path.join(dir, 'registry.json');
}

async function readDiskStore(): Promise<DiskPreviewRecord[]> {
  try {
    const raw = await fs.readFile(diskStorePath(), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is DiskPreviewRecord =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as Record<string, unknown>).id === 'string' &&
        typeof (r as Record<string, unknown>).pid === 'number' &&
        typeof (r as Record<string, unknown>).port === 'number',
    );
  } catch {
    return [];
  }
}

async function writeDiskStore(records: DiskPreviewRecord[]): Promise<void> {
  try {
    const p = diskStorePath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(records, null, 2), 'utf8');
  } catch {
    /* best-effort */
  }
}

async function syncDiskStore(registry: Map<string, PreviewRecord>): Promise<void> {
  const out: DiskPreviewRecord[] = [];
  for (const rec of registry.values()) {
    if (!rec.pid || !rec.port) continue;
    if (rec.status === 'stopped' || rec.status === 'error') continue;
    out.push({
      id: rec.id,
      pid: rec.pid,
      port: rec.port,
      workspacePath: rec.workspacePath,
      startedAt: rec.startedAt ?? new Date().toISOString(),
    });
  }
  await writeDiskStore(out);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    return code === 'EPERM';
  }
}

async function reapStaleFromDisk(_registry: Map<string, PreviewRecord>): Promise<void> {
  const stale = await readDiskStore();
  if (stale.length === 0) return;
  for (const r of stale) {
    if (!isPidAlive(r.pid)) continue;
    try {
      process.kill(r.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    setTimeout(() => {
      if (isPidAlive(r.pid)) {
        try {
          process.kill(r.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    }, KILL_GRACE_MS).unref?.();
  }
  await writeDiskStore([]);
}

function installShutdownHandlers(registry: Map<string, PreviewRecord>): void {
  const kill = (signal: NodeJS.Signals) => {
    for (const rec of registry.values()) {
      if (rec.child && !rec.child.killed) {
        try {
          rec.child.kill(signal);
        } catch {
          /* ignore */
        }
      }
      if (rec.installingChild && !rec.installingChild.killed) {
        try {
          rec.installingChild.kill(signal);
        } catch {
          /* ignore */
        }
      }
      if (rec.watcher) {
        try {
          void rec.watcher.close();
        } catch {
          /* ignore */
        }
      }
    }
  };
  const onSignal = (signal: NodeJS.Signals) => {
    kill(signal);
    setTimeout(() => kill('SIGKILL'), KILL_GRACE_MS).unref?.();
  };
  process.once('SIGINT', () => onSignal('SIGINT'));
  process.once('SIGTERM', () => onSignal('SIGTERM'));
  process.once('beforeExit', () => onSignal('SIGTERM'));
}

function gracefulKill(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.killed) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    child.once('close', finish);
    try {
      child.kill('SIGTERM');
    } catch {
      return finish();
    }
    const t = setTimeout(() => {
      if (!child.killed) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
      finish();
    }, KILL_GRACE_MS);
    t.unref?.();
  });
}

async function determineInstallReason(dir: string): Promise<string | null> {
  const nmStat = await fs.stat(path.join(dir, 'node_modules')).catch(() => null);
  if (!nmStat?.isDirectory()) return 'node_modules missing';
  const pkgStat = await fs.stat(path.join(dir, 'package.json')).catch(() => null);
  if (!pkgStat) return null;
  const lockStat = await fs
    .stat(path.join(dir, 'node_modules', '.package-lock.json'))
    .catch(() => null);
  if (!lockStat) return 'prior install never finished';
  if (pkgStat.mtimeMs > lockStat.mtimeMs) {
    return 'package.json newer than node_modules — reinstalling';
  }
  return null;
}

async function hasPackageJson(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, 'package.json'));
    return true;
  } catch {
    return false;
  }
}

const SIDECAR_MARKER = '// oracle:sidecar v2';
const SIDECAR_FILE = 'next.config.oracle.mjs';
const USER_CONFIG_FILE = 'next.config.mjs';

function renderSidecar(basePath: string): string {
  return `${SIDECAR_MARKER}
// Auto-generated by Oracle before each preview start — do NOT edit.
// Override or extend Next config in next.config.mjs, which spreads this file.
/** @type {import('next').NextConfig} */
const oracleConfig = {
  reactStrictMode: true,
  basePath: "${basePath}",
  images: { unoptimized: true },
};

export default oracleConfig;
`;
}

function renderUserConfigBootstrap(): string {
  return `import oracleConfig from "./${SIDECAR_FILE}";

/** @type {import('next').NextConfig} */
const userConfig = {
  // Extend your Next config here. The sidecar's basePath always wins.
};

export default { ...oracleConfig, ...userConfig, basePath: oracleConfig.basePath };
`;
}

async function stampOracleConfig(workspacePath: string, id: string): Promise<void> {
  const safeId = id.replace(/[^A-Za-z0-9._-]/g, '');
  const basePath = `/preview/${safeId}`;
  await fs.writeFile(path.join(workspacePath, SIDECAR_FILE), renderSidecar(basePath), 'utf8');

  const userConfigPath = path.join(workspacePath, USER_CONFIG_FILE);
  const altConfigs = ['next.config.js', 'next.config.ts', 'next.config.cjs'];

  for (const name of altConfigs) {
    const p = path.join(workspacePath, name);
    try {
      await fs.access(p);
      await fs.rm(p, { force: true });
    } catch {
      /* not present */
    }
  }

  let existing: string | null = null;
  try {
    existing = await fs.readFile(userConfigPath, 'utf8');
  } catch {
    /* not present */
  }

  const importsSidecar =
    existing !== null && new RegExp(`from\\s+["']\\./${SIDECAR_FILE}["']`).test(existing);

  if (existing === null || !importsSidecar) {
    await fs.writeFile(userConfigPath, renderUserConfigBootstrap(), 'utf8');
  }
}

function publicState(rec: PreviewRecord): PreviewState {
  return {
    id: rec.id,
    workspacePath: rec.workspacePath,
    status: rec.status,
    phase: rec.phase,
    port: rec.port,
    url: rec.url,
    startedAt: rec.startedAt,
    readyAt: rec.readyAt,
    error: rec.error,
    log: rec.log.slice(),
    compileErrors: rec.compileErrors.map((e) => ({ ...e, stack: e.stack.slice() })),
    crashCount: rec.crashCount,
    rebuildReason: rec.rebuildReason,
    pid: rec.pid,
    lastHitAt: rec.lastHitAt,
  };
}

export function touchPreview(id: string): boolean {
  const rec = getRegistry().get(id);
  if (!rec) return false;
  rec.lastHitAt = Date.now();
  return true;
}

export async function waitForPreviewReady(
  id: string,
  timeoutMs: number,
): Promise<PreviewState | null> {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const state = getPreviewState(id);
    if (!state) return null;
    if (state.phase === 'first-paint' || state.phase === 'live') return state;
    if (state.phase === 'error' || state.phase === 'stopped') return state;
    if (Date.now() >= deadline) return state;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 250);
      t.unref?.();
    });
  }
}

export function getPreviewState(id: string): PreviewState | null {
  const rec = getRegistry().get(id);
  return rec ? publicState(rec) : null;
}

export interface StartPreviewOptions {
  hardRebuild?: boolean;
  restartReason?: string;
}

function newRecord(id: string, workspacePath: string): PreviewRecord {
  return {
    id,
    workspacePath,
    status: 'idle',
    phase: 'idle',
    log: [],
    compileErrors: [],
    crashCount: 0,
    crashTimestamps: [],
    accumulator: new CompileErrorAccumulator(),
    lastHitAt: Date.now(),
  };
}

export async function startPreview(
  id: string,
  opts: StartPreviewOptions = {},
): Promise<PreviewState> {
  const registry = getRegistry();
  const workspacePath = await getWorkspacePath(id);

  if (!(await hasPackageJson(workspacePath))) {
    const rec = newRecord(id, workspacePath);
    rec.status = 'error';
    rec.phase = 'error';
    rec.error = 'No package.json in workspace. Seed the workspace before launching a preview.';
    registry.set(id, rec);
    emitEvent({ type: 'state', id });
    return publicState(rec);
  }

  await stampOracleConfig(workspacePath, id);

  if (opts.hardRebuild) {
    const prior = registry.get(id);
    if (prior?.child) await gracefulKill(prior.child);
    if (prior?.watcher) {
      try {
        await prior.watcher.close();
      } catch {
        /* ignore */
      }
    }
    if (prior?.probeAbort) prior.probeAbort.abort();
    await Promise.all([
      fs.rm(path.join(workspacePath, '.next'), { recursive: true, force: true }),
      fs.rm(path.join(workspacePath, 'node_modules', '.cache'), {
        recursive: true,
        force: true,
      }),
    ]);
    const priorCrashes = prior?.crashTimestamps?.slice() ?? [];
    const priorCrashCount = prior?.crashCount ?? 0;
    registry.delete(id);
    const carry = registry.get(id);
    if (carry) {
      carry.crashTimestamps = priorCrashes;
      carry.crashCount = priorCrashCount;
    }
  }

  const existing = registry.get(id);
  if (
    existing &&
    (existing.phase === 'compiling' ||
      existing.phase === 'first-paint' ||
      existing.phase === 'live' ||
      existing.phase === 'installing')
  ) {
    return publicState(existing);
  }

  const cap = getMaxConcurrentPreviews();
  let activeCount = 0;
  for (const r of registry.values()) {
    if (r.id === id) continue;
    if (
      r.phase === 'installing' ||
      r.phase === 'compiling' ||
      r.phase === 'first-paint' ||
      r.phase === 'live'
    ) {
      activeCount++;
    }
  }
  if (activeCount >= cap) {
    const rec: PreviewRecord = existing ?? newRecord(id, workspacePath);
    rec.workspacePath = workspacePath;
    registry.set(id, rec);
    setPhase(rec, 'error', {
      error: 'Preview capacity reached — try again in a moment.',
    });
    appendLog(rec, `✗ capacity cap (${cap}) hit — rejecting start`);
    return publicState(rec);
  }

  const rec: PreviewRecord = existing ?? newRecord(id, workspacePath);
  rec.workspacePath = workspacePath;
  rec.compileErrors = [];
  rec.accumulator = new CompileErrorAccumulator();
  rec.error = undefined;
  rec.rebuildReason = opts.restartReason;
  rec.startedAt = new Date().toISOString();
  rec.log = rec.log.slice(-MAX_LOG_LINES);
  registry.set(id, rec);

  setPhase(rec, 'compiling');
  appendLog(
    rec,
    `→ starting preview for ${id}${opts.restartReason ? ` (${opts.restartReason})` : ''}`,
  );

  const installReason = await determineInstallReason(workspacePath);
  if (installReason) {
    setPhase(rec, 'installing');
    appendLog(rec, `→ npm install (${installReason})`);
    const installResult = await runInstall(rec);
    if (!installResult.ok) {
      setPhase(rec, 'error', { error: installResult.error });
      appendLog(rec, `✗ install failed: ${installResult.error}`);
      return publicState(rec);
    }
    appendLog(rec, '✓ install complete');
  }

  let port: number;
  try {
    port = await findFreePort();
  } catch (err) {
    setPhase(rec, 'error', { error: err instanceof Error ? err.message : String(err) });
    appendLog(rec, `✗ port allocation: ${rec.error}`);
    return publicState(rec);
  }
  rec.port = port;
  const publicBase = process.env.ORACLE_PUBLIC_URL?.replace(/\/$/, '') || '';
  rec.url = `${publicBase}/preview/${encodeURIComponent(id)}`;
  setPhase(rec, 'compiling');
  appendLog(rec, `→ next dev -p ${port}`);

  const child = spawn('npx', ['next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: workspacePath,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  rec.child = child;
  rec.pid = child.pid;

  const wireStream = (stream: 'stdout' | 'stderr') => {
    const src = stream === 'stdout' ? child.stdout : child.stderr;
    if (!src) return;
    src.setEncoding('utf8');
    let buffer = '';
    src.on('data', (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (!line.length) {
          const finished = rec.accumulator?.push({ kind: 'compile-error-end' }, '');
          if (finished) pushCompileError(rec, finished);
          continue;
        }
        appendLog(rec, (stream === 'stderr' ? '! ' : '') + line);

        const cls = classifyLogLine(line);
        const finished = rec.accumulator?.push(cls, line);
        if (finished) pushCompileError(rec, finished);

        if (isTerminalError(cls)) {
          if (rec.phase !== 'live') {
            setPhase(rec, 'error', { error: cls.message ?? 'Compile error' });
            if (rec.probeAbort) rec.probeAbort.abort();
          }
        } else if (isRecoveryMarker(cls)) {
          if (rec.phase === 'error') {
            rec.compileErrors = [];
            setPhase(rec, 'compiling');
            appendLog(rec, '↻ recompiled after error — re-probing');
            startReadinessProbe(rec);
          } else if (rec.phase === 'compiling' && !rec.probeAbort) {
            startReadinessProbe(rec);
          }
        }

        if (/Ready in|started server on|- Local:/i.test(line) && !rec.probeAbort) {
          startReadinessProbe(rec);
        }
      }
    });
  };
  wireStream('stdout');
  wireStream('stderr');

  child.on('error', (err) => {
    setPhase(rec, 'error', { error: err.message });
    appendLog(rec, `✗ spawn error: ${err.message}`);
    void syncDiskStore(registry);
  });

  child.on('close', (code, signal) => {
    if (rec.watcher) {
      try {
        void rec.watcher.close();
      } catch {
        /* ignore */
      }
      rec.watcher = undefined;
    }
    if (rec.probeAbort) {
      rec.probeAbort.abort();
      rec.probeAbort = undefined;
    }
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      setPhase(rec, 'stopped');
      appendLog(rec, `⊗ stopped (${signal})`);
    } else if (code !== 0 && rec.phase === 'live') {
      appendLog(rec, `✗ dev server crashed (code ${code ?? 'null'}) — attempting restart`);
      void attemptAutoRestart(rec, `restarted after crash (code ${code ?? 'null'})`);
    } else if (code !== 0 && rec.phase !== 'error') {
      setPhase(rec, 'error', { error: `exit code ${code ?? 'null'}` });
      appendLog(rec, `✗ exited with code ${code ?? 'null'}`);
    } else {
      setPhase(rec, 'stopped');
      appendLog(rec, `⊗ exited (code ${code ?? 'null'})`);
    }
    rec.child = undefined;
    void syncDiskStore(registry);
  });

  void startWatcher(rec);
  void syncDiskStore(registry);

  return publicState(rec);
}

function pushCompileError(rec: PreviewRecord, err: CompileError): void {
  rec.compileErrors.push(err);
  if (rec.compileErrors.length > 5) rec.compileErrors.splice(0, rec.compileErrors.length - 5);
  emitEvent({ type: 'state', id: rec.id });
}

function startReadinessProbe(rec: PreviewRecord): void {
  if (rec.probeAbort) return;
  const controller = new AbortController();
  rec.probeAbort = controller;
  const deadline = Date.now() + PROBE_DEADLINE_MS;
  const probeUrl = `http://127.0.0.1:${rec.port}/preview/${encodeURIComponent(rec.id)}`;
  let firstPaintAt: number | null = null;

  const tick = async () => {
    if (controller.signal.aborted) return;
    if (rec.phase === 'stopped' || rec.phase === 'error') return;

    try {
      const res = await fetch(probeUrl, {
        redirect: 'follow',
        headers: { accept: 'text/html' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6_000)]),
      });
      if (res.ok) {
        if (firstPaintAt === null) {
          firstPaintAt = Date.now();
          setPhase(rec, 'first-paint');
          appendLog(rec, `✓ preview probe 200 — page compiled`);
          void syncDiskStore(getRegistry());
        } else if (Date.now() - firstPaintAt >= 3_000 && rec.phase !== 'live') {
          setPhase(rec, 'live');
          appendLog(rec, `✓ preview stable (3s)`);
        }
        if (rec.phase === 'live') {
          rec.probeAbort = undefined;
          return;
        }
      }
    } catch {
      /* compile / start in progress — retry */
    }

    const elapsed = Date.now() - (rec.startedAt ? new Date(rec.startedAt).getTime() : Date.now());
    const afterGrace = elapsed > PROBE_GRACE_MS;

    if (Date.now() > deadline) {
      if (rec.phase !== 'first-paint' && rec.phase !== 'live') {
        setPhase(rec, 'error', {
          error: 'Preview did not respond within 90s — check the log for compile errors.',
        });
        appendLog(rec, `✗ readiness probe timed out after ${PROBE_DEADLINE_MS / 1000}s`);
        void syncDiskStore(getRegistry());
      }
      rec.probeAbort = undefined;
      return;
    }

    setTimeout(tick, afterGrace ? 500 : 250);
  };

  setTimeout(tick, 250);
}

async function runInstall(rec: PreviewRecord): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      'npm',
      ['install', '--include=dev', '--no-audit', '--no-fund', '--prefer-offline'],
      {
        cwd: rec.workspacePath,
        env: { ...process.env, NODE_ENV: 'development', FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    rec.installingChild = child;
    const wire = (stream: 'stdout' | 'stderr') => {
      const src = stream === 'stdout' ? child.stdout : child.stderr;
      if (!src) return;
      src.setEncoding('utf8');
      let buf = '';
      src.on('data', (chunk: string) => {
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx).replace(/\r$/, '');
          buf = buf.slice(idx + 1);
          if (!line.trim()) continue;
          appendLog(rec, `[install] ${line}`);
        }
      });
    };
    wire('stdout');
    wire('stderr');
    child.on('error', (err) => {
      rec.installingChild = undefined;
      resolve({ ok: false, error: err.message });
    });
    child.on('close', (code) => {
      rec.installingChild = undefined;
      resolve({ ok: code === 0, error: code === 0 ? undefined : `npm install exited ${code}` });
    });
  });
}

async function startWatcher(rec: PreviewRecord): Promise<void> {
  let chokidar: typeof import('chokidar') | null = null;
  try {
    chokidar = await import('chokidar');
  } catch {
    appendLog(rec, '◦ file watcher unavailable (chokidar missing) — auto-reload disabled');
    return;
  }
  const watcher = chokidar.watch(rec.workspacePath, {
    ignored: [
      /(^|[\\/])\.[^\\/]/,
      /\bnode_modules\b/,
      /\b\.next\b/,
      /\b\.turbo\b/,
      /\b\.vercel\b/,
      /\b\.git\b/,
      /\boracle-checkpoints\b/,
      /\.log$/,
      /\.lock$/,
    ],
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    persistent: true,
  });
  rec.watcher = watcher;

  let pending: Set<string> = new Set();
  let flushTimer: NodeJS.Timeout | null = null;

  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      const batch = Array.from(pending);
      pending = new Set();
      if (batch.length === 0) return;

      const rel = batch
        .map((abs) => path.relative(rec.workspacePath, abs).replace(/\\/g, '/'))
        .filter((p) => p && !p.startsWith('..') && p !== SIDECAR_FILE);

      if (rel.length === 0) return;

      const configTouched = rel.find(isConfigClassFile);
      if (configTouched) {
        const reason = `config changed (${configTouched})`;
        appendLog(rec, `↻ ${reason} — hard rebuilding`);
        emitEvent({ type: 'rebuild', id: rec.id, reason });
        rec.rebuildReason = reason;
        try {
          await startPreview(rec.id, { hardRebuild: true, restartReason: reason });
        } catch (err) {
          appendLog(
            rec,
            `✗ auto hard-rebuild failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else {
        emitEvent({ type: 'change', id: rec.id, files: rel });
      }
    }, WATCHER_DEBOUNCE_MS);
  };

  watcher.on('add', (p) => {
    pending.add(p);
    scheduleFlush();
  });
  watcher.on('change', (p) => {
    pending.add(p);
    scheduleFlush();
  });
  watcher.on('unlink', (p) => {
    pending.add(p);
    scheduleFlush();
  });
  watcher.on('error', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog(rec, `! watcher error: ${msg}`);
  });
}

async function attemptAutoRestart(rec: PreviewRecord, reason: string): Promise<void> {
  const now = Date.now();
  rec.crashTimestamps = (rec.crashTimestamps ?? []).filter((t) => now - t < CRASH_WINDOW_MS);
  rec.crashTimestamps.push(now);
  rec.crashCount = rec.crashTimestamps.length;

  if (rec.crashCount > MAX_AUTO_RESTARTS) {
    setPhase(rec, 'error', {
      error: `Preview crashed ${rec.crashCount} times in ${CRASH_WINDOW_MS / 1000}s — check the log.`,
    });
    appendLog(rec, `✗ giving up on auto-restart (${rec.crashCount} crashes)`);
    return;
  }

  try {
    await startPreview(rec.id, { hardRebuild: true, restartReason: reason });
  } catch (err) {
    setPhase(rec, 'error', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function stopPreview(id: string): boolean {
  const registry = getRegistry();
  const rec = registry.get(id);
  if (!rec) return false;
  if (rec.watcher) {
    try {
      void rec.watcher.close();
    } catch {
      /* ignore */
    }
    rec.watcher = undefined;
  }
  if (rec.probeAbort) {
    rec.probeAbort.abort();
    rec.probeAbort = undefined;
  }
  void gracefulKill(rec.installingChild);
  void gracefulKill(rec.child);
  setPhase(rec, 'stopped');
  void syncDiskStore(registry);
  return true;
}

export function listPreviews(): PreviewState[] {
  return Array.from(getRegistry().values()).map(publicState);
}

export { SIDECAR_FILE };
export type { CompileError };
