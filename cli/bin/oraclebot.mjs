#!/usr/bin/env node
/**
 * OracleBot CLI — `oraclebot <command>`.
 *
 * Zero runtime deps. Pure Node 20 stdlib. Pairs with API tokens minted at
 * https://oraclebot.net under Settings → API tokens.
 *
 * Commands:
 *   scan <target-url>       Run a scan, poll, print result
 *   status <run-id>          Show current state of a run
 *   whoami                   Show which org the configured token belongs to
 *   verify <domain>          Print DNS-TXT / well-known instructions for a domain
 *   help                     Show usage
 *
 * Auth: token comes from --token flag, ORACLEBOT_TOKEN env, or
 * ~/.oraclebot/token (in that order). API base from --api-url, ORACLEBOT_API,
 * or https://oraclebot.net.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PKG_VERSION = '0.1.0';
const DEFAULT_API = 'https://oraclebot.net';
const DEFAULT_PACKS = 'web_classics,ai_built_apps';
const DEFAULT_PRODUCT = 'free';
const DEFAULT_BOT_COUNT = 5;
const DEFAULT_DURATION_MIN = 3;
const DEFAULT_HARD_CAP_CENTS = 5000;
const DEFAULT_MAX_WAIT_MIN = 20;

// ── Argv parsing ────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
  printHelp();
  process.exit(0);
}
if (argv[0] === '--version' || argv[0] === '-v' || argv[0] === 'version') {
  console.log(`@oraclebot/cli v${PKG_VERSION}`);
  process.exit(0);
}

const command = argv[0];
const flags = parseFlags(argv.slice(1));
const positional = flags._;

const apiUrl = (flag('api-url') ?? process.env.ORACLEBOT_API ?? DEFAULT_API).replace(/\/$/, '');
const tokenSource = pickToken();
const token = tokenSource?.token;

// Most commands need a token; `help`/`version` short-circuit above.
function ensureToken() {
  if (!token) {
    fail(
      'No API token found. Provide one of:\n' +
        '  --token obt_…\n' +
        '  ORACLEBOT_TOKEN=obt_… in your environment\n' +
        '  ~/.oraclebot/token containing the token (mode 0600)\n\n' +
        'Mint a token at ' + apiUrl + '/app/settings/api-tokens',
    );
  }
}

// ── Command dispatch ────────────────────────────────────────────────────────

switch (command) {
  case 'scan':
    await cmdScan();
    break;
  case 'status':
    await cmdStatus();
    break;
  case 'whoami':
    await cmdWhoami();
    break;
  case 'verify':
    await cmdVerify();
    break;
  case 'login':
    cmdLogin();
    break;
  default:
    fail(`Unknown command: ${command}\nRun \`oraclebot help\` for usage.`);
}

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdScan() {
  ensureToken();
  const targetUrl = positional[0] ?? flag('target');
  if (!targetUrl) fail('scan: missing target URL\nusage: oraclebot scan <target-url> [--packs ...]');

  const packs = (flag('packs') ?? DEFAULT_PACKS).split(',').map((p) => p.trim()).filter(Boolean);
  const productKey = flag('product') ?? DEFAULT_PRODUCT;
  const botCount = Number(flag('bots') ?? DEFAULT_BOT_COUNT);
  const durationMinutes = Number(flag('duration') ?? DEFAULT_DURATION_MIN);
  const hardCapCents = Number(flag('hard-cap-cents') ?? DEFAULT_HARD_CAP_CENTS);
  const maxWaitMin = Number(flag('max-wait-min') ?? DEFAULT_MAX_WAIT_MIN);
  const wait = !flag('no-wait');
  const json = !!flag('json');

  if (!json) {
    log('OracleBot scan');
    log(`  target:   ${targetUrl}`);
    log(`  packs:    ${packs.join(', ')}`);
    log(`  product:  ${productKey}`);
    log(`  bots:     ${botCount}`);
    log(`  duration: ${durationMinutes} min`);
    log('');
  }

  const create = await api('POST', '/api/runs', {
    mode: deriveMode(packs),
    name: flag('name') ?? `cli-${new Date().toISOString().slice(0, 16)}`,
    productKey,
    botCount,
    durationMinutes,
    target: { kind: 'liveUrl', url: targetUrl },
    packs,
    hardCapCents,
    idempotencyKey: flag('idempotency-key') ?? `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  });
  if (!create.ok) fail(`Failed to create run: ${formatErr(create.body)}`);
  const runId = create.body?.data?.runId;
  if (!runId) fail('Run created but response missing runId');

  if (json && !wait) {
    process.stdout.write(JSON.stringify({ runId, status: 'queued' }) + '\n');
    return;
  }

  if (!wait) {
    log(`✓ Run ${runId} queued.`);
    log(`  Live: ${apiUrl}/app/tests/${runId}/live`);
    return;
  }

  if (!json) log(`Polling… (timeout ${maxWaitMin} min)`);
  const detail = await pollUntilDone(runId, maxWaitMin, !json);
  if (!detail) fail(`Timed out waiting for run ${runId}.`);

  const run = detail.run;
  const findings = detail.findings ?? [];
  const result = {
    runId,
    status: run.status,
    score: run.readinessScore,
    findings: findings.length,
    runUrl: `${apiUrl}/app/tests/${runId}/results`,
  };

  if (json) {
    process.stdout.write(JSON.stringify(result) + '\n');
    if (run.status !== 'completed') process.exit(1);
    return;
  }

  log('');
  log(`Status:    ${run.status}`);
  log(`Findings:  ${findings.length}`);
  if (run.readinessScore != null) log(`Readiness: ${run.readinessScore}/100`);
  log(`Open:      ${result.runUrl}`);
  if (run.status !== 'completed') process.exit(1);
}

async function cmdStatus() {
  ensureToken();
  const runId = positional[0];
  if (!runId) fail('status: missing run id\nusage: oraclebot status <run-id>');
  const r = await api('GET', `/api/runs/${runId}`);
  if (!r.ok) fail(formatErr(r.body));
  const json = !!flag('json');
  if (json) {
    process.stdout.write(JSON.stringify(r.body?.data ?? {}) + '\n');
    return;
  }
  const run = r.body?.data?.run;
  if (!run) fail('Run not found');
  log(`Run ${runId}`);
  log(`  status:    ${run.status}`);
  log(`  mode:      ${run.mode}`);
  log(`  packs:     ${(run.packs ?? []).join(', ') || '(default)'}`);
  log(`  target:    ${run.targetLiveUrl ?? run.targetAgentEndpoint ?? '—'}`);
  if (run.readinessScore != null) log(`  score:     ${run.readinessScore}/100`);
  log(`  findings:  ${(r.body.data.findings ?? []).length}`);
  log(`  open:      ${apiUrl}/app/tests/${runId}/results`);
}

async function cmdWhoami() {
  ensureToken();
  // /api/runs returns the org-scoped run list; reuse it as a low-cost check
  // that the token is valid + figure out the org from a recent run.
  const r = await api('GET', '/api/runs');
  if (!r.ok) fail(`Auth check failed: ${formatErr(r.body)}`);
  const runs = r.body?.data?.runs ?? [];
  const orgId = runs[0]?.orgId ?? '(no runs yet — org id unknown)';
  log(`Token: ${token.slice(0, 12)}…`);
  log(`Source: ${tokenSource.source}`);
  log(`API: ${apiUrl}`);
  log(`Org: ${orgId}`);
  log(`Recent runs visible: ${runs.length}`);
}

async function cmdVerify() {
  ensureToken();
  const domain = positional[0];
  if (!domain) fail('verify: missing domain\nusage: oraclebot verify <domain> [--method dns_txt|well_known_file]');
  const method = flag('method') ?? 'well_known_file';
  const r = await api('POST', '/api/verify-target', { domain, method });
  if (!r.ok) fail(formatErr(r.body));
  const data = r.body.data;
  log(`Verification id: ${data.verification?.id}`);
  log(`Method: ${method}`);
  if (data.instructions) {
    log('');
    log(data.instructions.summary);
    for (const line of data.instructions.details ?? []) log(`  ${line}`);
    log('');
    log(`After publishing, run: oraclebot verify ${domain} --check`);
  }
}

function cmdLogin() {
  // Interactive: prompt for token via stdin, store in ~/.oraclebot/token.
  process.stdout.write('Paste your OracleBot API token (obt_…): ');
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let buf = '';
  process.stdin.on('data', (chunk) => {
    buf += chunk.toString();
    if (buf.includes('\n')) {
      const tok = buf.trim().split(/\s+/)[0];
      if (!tok.startsWith('obt_')) {
        process.stderr.write('Token must start with obt_\n');
        process.exit(1);
      }
      const dir = join(homedir(), '.oraclebot');
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
      const path = join(dir, 'token');
      writeFileSync(path, tok + '\n', { mode: 0o600 });
      console.log(`\n✓ Token saved to ${path}`);
      process.exit(0);
    }
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'user-agent': `OracleBot-CLI/${PKG_VERSION}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    return { ok: false, status: 0, body: { message: `network error: ${err?.message ?? err}` } };
  }
  let parsed = null;
  try { parsed = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: parsed };
}

async function pollUntilDone(runId, maxWaitMin, verbose) {
  const deadline = Date.now() + maxWaitMin * 60_000;
  let lastStatus = '';
  let lastFindings = -1;
  while (Date.now() < deadline) {
    await sleep(8_000);
    const r = await api('GET', `/api/runs/${runId}`);
    if (!r.ok) {
      if (verbose) log(`  poll: ${r.status} ${formatErr(r.body)} (will retry)`);
      continue;
    }
    const d = r.body?.data;
    const status = d?.run?.status ?? '?';
    const findings = (d?.findings ?? []).length;
    if (verbose && (status !== lastStatus || findings !== lastFindings)) {
      log(`  status=${status}  findings=${findings}`);
      lastStatus = status;
      lastFindings = findings;
    }
    if (
      status === 'completed' || status === 'failed' ||
      status === 'canceled' || status === 'timed_out'
    ) {
      return d;
    }
  }
  return null;
}

function deriveMode(packs) {
  // Mirrors NewRunWizard.modeForPacks logic.
  if (packs.includes('llm_endpoints') && !packs.some((p) => p === 'web_classics' || p === 'ai_built_apps')) return 'agent';
  if (packs.includes('mcp_server') && !packs.some((p) => p === 'web_classics' || p === 'ai_built_apps')) return 'api';
  return 'site';
}

function pickToken() {
  const fromFlag = flag('token');
  if (fromFlag) return { token: fromFlag, source: '--token' };
  const fromEnv = process.env.ORACLEBOT_TOKEN;
  if (fromEnv) return { token: fromEnv, source: 'ORACLEBOT_TOKEN env' };
  const path = join(homedir(), '.oraclebot', 'token');
  if (existsSync(path)) {
    const tok = readFileSync(path, 'utf8').trim();
    if (tok) return { token: tok, source: path };
  }
  return null;
}

function parseFlags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function flag(name) { return flags[name]; }
function log(msg) { process.stdout.write(msg + '\n'); }
function fail(msg) { process.stderr.write(`✗ ${msg}\n`); process.exit(1); }
function formatErr(body) {
  if (!body) return 'no body';
  if (typeof body === 'string') return body.slice(0, 200);
  return body.message || body.error || JSON.stringify(body).slice(0, 200);
}

function printHelp() {
  process.stdout.write(`OracleBot CLI v${PKG_VERSION}

Usage: oraclebot <command> [args] [flags]

Commands:
  scan <url>           Run a scan against a verified target, poll, print result
  status <run-id>      Print current state of a run
  whoami               Show which token / org / API URL is in use
  verify <domain>      Create a verification challenge for a domain
  login                Save an API token to ~/.oraclebot/token (mode 0600)

Common flags:
  --token obt_…        Override the token from env / config
  --api-url <url>      Override the API base URL
  --json               Machine-readable output
  --help               Show this help

scan flags:
  --packs web_classics,ai_built_apps  Comma-separated probe pack ids
  --product free                       Tier (free/scout/builder/studio/stack)
  --bots 5
  --duration 3                         Minutes
  --no-wait                            Queue and exit immediately
  --max-wait-min 20                    Polling timeout
  --name "<name>"                      Run name (defaults to cli-<timestamp>)

verify flags:
  --method dns_txt | well_known_file  (default: well_known_file)

Auth: token is read from --token, then ORACLEBOT_TOKEN env, then
~/.oraclebot/token (run \`oraclebot login\` to create that file).

Mint a token at: https://oraclebot.net/app/settings/api-tokens
`);
}
