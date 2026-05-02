#!/usr/bin/env node
/**
 * OracleBot Scan — GitHub Action entrypoint.
 *
 * Reads inputs via INPUT_<UPPER_NAME> env vars (GitHub Actions convention for
 * `inputs:` in action.yml). Creates a run, polls until completion, sets
 * GitHub Actions outputs, optionally posts a PR comment.
 *
 * Zero runtime deps — pure Node 20 stdlib (fetch, fs, https). Keeps the
 * action fast to load: no `npm install` step required.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

// ── Inputs ──────────────────────────────────────────────────────────────────

const apiUrl = (process.env.INPUT_API_URL || 'https://oraclebot.net').replace(/\/$/, '');
const token = process.env.INPUT_ORACLEBOT_TOKEN || '';
const targetUrl = process.env.INPUT_TARGET_URL || '';
const productKey = process.env.INPUT_PRODUCT_KEY || 'free';
const packsRaw = process.env.INPUT_PACKS || 'web_classics,ai_built_apps';
const minScore = Number(process.env.INPUT_MIN_SCORE || '70');
const maxWaitMin = Number(process.env.INPUT_MAX_WAIT_MIN || '20');
const failOnLow = (process.env.INPUT_FAIL_ON_LOW || 'true').toLowerCase() === 'true';
const runName =
  process.env.INPUT_RUN_NAME ||
  (process.env.GITHUB_REPOSITORY && process.env.GITHUB_SHA
    ? `${process.env.GITHUB_REPOSITORY}@${process.env.GITHUB_SHA.slice(0, 7)}`
    : `ci-run-${new Date().toISOString().slice(0, 16)}`);

if (!token) fail('oraclebot-token input is required');
if (!targetUrl) fail('target-url input is required');

const packs = packsRaw
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

logHeader();

// ── 1. Create run ───────────────────────────────────────────────────────────

const createRes = await api('POST', '/api/runs', {
  mode: deriveMode(packs),
  name: runName,
  productKey,
  botCount: 5,
  durationMinutes: 3,
  target: { kind: 'liveUrl', url: targetUrl },
  packs,
  hardCapCents: 5000,
  idempotencyKey: `gh-${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || 1}`,
});
if (!createRes.ok) fail(`Failed to create run: ${formatErr(createRes.body)}`);
const runId = createRes.body?.data?.runId;
if (!runId) fail('Run-creation response missing runId');

console.log(`✓ Run created: ${runId}`);
console.log(`  Live: ${apiUrl}/app/tests/${runId}/live`);

// ── 2. Poll until completion ────────────────────────────────────────────────

const deadline = Date.now() + maxWaitMin * 60_000;
let detail = null;
while (Date.now() < deadline) {
  await sleep(8_000);
  const res = await api('GET', `/api/runs/${runId}`);
  if (!res.ok) {
    console.error(`  poll: ${res.status} ${formatErr(res.body)} (will retry)`);
    continue;
  }
  detail = res.body?.data;
  const status = detail?.run?.status;
  const findingsSoFar = (detail?.findings ?? []).length;
  console.log(`  status=${status}  findings=${findingsSoFar}`);
  if (status === 'completed' || status === 'failed' || status === 'canceled' || status === 'timed_out') {
    break;
  }
}

if (!detail || !detail.run) fail(`Timed out after ${maxWaitMin} minutes`);

const run = detail.run;
const findings = detail.findings ?? [];
const score = run.readinessScore ?? null;

if (run.status !== 'completed') {
  fail(`Run ended with status=${run.status}`);
}

// ── 3. Resolve verification id for badge URL ────────────────────────────────

let badgeUrl = null;
let scorePageUrl = null;
const verRes = await api('GET', `/api/verify-target?list=1`);
if (verRes.ok) {
  const verifications = verRes.body?.data?.verifications ?? [];
  const targetHost = (() => {
    try {
      return new URL(targetUrl).hostname.toLowerCase();
    } catch {
      return null;
    }
  })();
  const v = verifications.find((vv) => vv.domain === targetHost && vv.status === 'verified');
  if (v) {
    badgeUrl = `${apiUrl}/api/badge/${v.id}.svg`;
    scorePageUrl = `${apiUrl}/score/${v.id}`;
  }
}

// ── 4. Set GitHub Actions outputs ───────────────────────────────────────────

setOutput('score', String(score ?? ''));
setOutput('status', run.status);
setOutput('run-id', runId);
setOutput('run-url', `${apiUrl}/app/tests/${runId}/results`);
setOutput('badge-url', badgeUrl ?? '');
setOutput('score-page-url', scorePageUrl ?? '');
setOutput('findings-count', String(findings.length));

// ── 5. Step summary + PR comment payload ────────────────────────────────────

const sevCounts = countSeverities(findings);
const summary = renderMarkdown({
  score,
  minScore,
  status: run.status,
  target: targetUrl,
  packs,
  findings,
  sevCounts,
  runUrl: `${apiUrl}/app/tests/${runId}/results`,
  badgeUrl,
  scorePageUrl,
});

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}

// Stash markdown for the post-comment step (action.yml chains a script step).
if (process.env.RUNNER_TEMP) {
  const path = `${process.env.RUNNER_TEMP}/oraclebot-comment.md`;
  appendFileSync(path, summary);
  setOutput('comment-path', path);
}

// ── 6. Threshold gate ───────────────────────────────────────────────────────

console.log('');
console.log(`Readiness: ${score} / 100   (threshold: ${minScore})`);
if (score == null) fail('Run completed but no readiness score was returned');
if (failOnLow && score < minScore) {
  console.log('');
  console.error(`❌ Below threshold (${score} < ${minScore}). Failing the build.`);
  process.exit(1);
}
console.log('✓ Above threshold. Build passes.');

// ── helpers ────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  // Wrapped: a network-layer failure (DNS, TLS, refused) becomes a
  // structured non-ok response so the caller's retry / fail logic still
  // applies. Unhandled rejections mid-action would crash the runner.
  let res;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'user-agent': 'OracleBot-GitHub-Action/1.0',
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

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    console.log(`::set-output name=${name}::${value}`);
    return;
  }
  // Newline-safe via heredoc-style format per actions/toolkit spec.
  const delim = `_GHA_OB_DELIM_${Math.random().toString(36).slice(2, 10)}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delim}\n${value}\n${delim}\n`);
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  if (process.env.GITHUB_OUTPUT) setOutput('error', msg);
  process.exit(1);
}

function deriveMode(packs) {
  // Mirror the wizard's logic: if packs include web_classics OR ai_built_apps
  // the run is a site-mode run (which also drives ai-built-apps probes). If
  // ONLY llm_endpoints is selected, agent mode. Multi-engine packs go to
  // stack mode.
  if (packs.includes('llm_endpoints') && !packs.some((p) => p === 'web_classics' || p === 'ai_built_apps')) {
    return 'agent';
  }
  return 'site';
}

function countSeverities(findings) {
  const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    if (c[f.severity] != null) c[f.severity]++;
  }
  return c;
}

function renderMarkdown({ score, minScore, status, target, packs, findings, sevCounts, runUrl, badgeUrl, scorePageUrl }) {
  const passing = score != null && score >= minScore;
  const grade = score == null ? '?' : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const lines = [];
  lines.push(`## ${passing ? '✅' : '❌'} OracleBot Readiness — ${score ?? '—'}/100 (Grade ${grade})`);
  lines.push('');
  if (badgeUrl && scorePageUrl) {
    lines.push(`[![OracleBot Readiness](${badgeUrl})](${scorePageUrl})`);
    lines.push('');
  }
  lines.push(`**Target:** \`${target}\`  `);
  lines.push(`**Packs:** ${packs.map((p) => `\`${p}\``).join(' · ')}  `);
  lines.push(`**Status:** \`${status}\`  `);
  lines.push(`**Threshold:** ${minScore}  `);
  lines.push(`**Findings:** ${findings.length} total — \`${sevCounts.critical}\` critical, \`${sevCounts.high}\` high, \`${sevCounts.medium}\` medium, \`${sevCounts.low}\` low, \`${sevCounts.info}\` info`);
  lines.push('');
  if (findings.length > 0) {
    lines.push('### Top findings');
    lines.push('');
    const top = findings
      .slice()
      .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
      .slice(0, 8);
    for (const f of top) {
      lines.push(`- **[${f.severity}]** ${escMd(f.title)}${f.probeId ? ` _(\`${f.probeId}\`)_` : ''}`);
    }
    if (findings.length > 8) lines.push(`- _… and ${findings.length - 8} more — see the full report_`);
    lines.push('');
  }
  lines.push(`**[Open full report →](${runUrl})**`);
  if (scorePageUrl) lines.push(`  ·  [Public score page](${scorePageUrl})`);
  lines.push('');
  lines.push('<sub>Generated by [OracleBot](https://oraclebot.net) — the readiness layer for AI-built software.</sub>');
  return lines.join('\n');
}

function severityWeight(s) {
  return { critical: 5, high: 4, medium: 3, low: 2, info: 1 }[s] ?? 0;
}
function escMd(s) {
  return String(s).replace(/[<>]/g, (c) => ({ '<': '&lt;', '>': '&gt;' })[c]);
}
function formatErr(body) {
  if (!body) return 'no body';
  if (typeof body === 'string') return body;
  return body.message || body.error || JSON.stringify(body).slice(0, 200);
}

function logHeader() {
  console.log('OracleBot scan');
  console.log('──────────────');
  console.log(`API:     ${apiUrl}`);
  console.log(`Target:  ${targetUrl}`);
  console.log(`Packs:   ${packs.join(', ')}`);
  console.log(`Min:     ${minScore}`);
  console.log(`Run:     ${runName}`);
  console.log('');
}
