/**
 * Export a real run's events + findings + metrics as a static JSON fixture
 * the marketing-site Live Scan modal replays on demand.
 *
 *   npx tsx scripts/dev/export-scan-fixture.mts <runId> > js/fixtures/scan.json
 */
import { config } from 'dotenv';
// Silent — dotenv's default banner pollutes stdout, and this script writes
// JSON to stdout for redirection into a fixture file.
config({ path: '.env.local', debug: false, quiet: true });

import { db } from '../../lib/db';
import { runs, runEvents, runFindings, runMetrics } from '../../lib/db/schema';
import { eq, asc } from 'drizzle-orm';

const RUN_ID = process.argv[2];
if (!RUN_ID) {
  console.error('usage: tsx export-scan-fixture.mts <runId>');
  process.exit(1);
}

async function main() {
  const r = await db.query.runs.findFirst({ where: eq(runs.id, RUN_ID) });
  if (!r) {
    console.error('Run not found');
    process.exit(1);
  }

  const events = await db.query.runEvents.findMany({
    where: eq(runEvents.runId, RUN_ID),
    orderBy: [asc(runEvents.createdAt)],
  });
  const findings = await db.query.runFindings.findMany({
    where: eq(runFindings.runId, RUN_ID),
  });
  const metrics = await db.query.runMetrics.findMany({
    where: eq(runMetrics.runId, RUN_ID),
    orderBy: [asc(runMetrics.tSeconds)],
  });

  const startMs = r.startedAt ? r.startedAt.getTime() : (events[0]?.createdAt?.getTime() ?? 0);

  // Strip absolute domain off the target so the fixture is portable.
  const targetUrl = r.targetLiveUrl ?? r.targetAgentEndpoint ?? '<target>';

  const fixture = {
    _comment: 'Captured from a real OracleBot scan via scripts/dev/export-scan-fixture.mts. Replayed by the homepage Live Scan modal.',
    run: {
      id: r.id,
      mode: r.mode,
      packs: r.packs,
      target: targetUrl,
      botCount: r.botCount,
      durationMinutes: r.durationMinutes,
      readinessScore: r.readinessScore,
      status: r.status,
    },
    events: events.map((e) => ({
      tMs: e.createdAt ? e.createdAt.getTime() - startMs : 0,
      type: e.type,
      message: e.message,
    })),
    findings: findings.map((f) => ({
      severity: f.severity,
      category: f.category,
      probeId: f.probeId,
      title: f.title,
      description: f.description.slice(0, 280),
      remediation: f.remediation?.slice(0, 280) ?? null,
    })),
    metrics: metrics.map((m) => ({
      tSeconds: m.tSeconds,
      activeBots: m.activeBots,
      rps: m.rps,
      p50Ms: m.p50Ms,
      p95Ms: m.p95Ms,
      errorRate: m.errorRate,
    })),
  };

  process.stdout.write(JSON.stringify(fixture, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
