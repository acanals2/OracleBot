import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../lib/db';
import { runs, runFindings, runEvents } from '../lib/db/schema';
import { eq, desc } from 'drizzle-orm';

const RUN_ID = process.argv[2];
if (!RUN_ID) {
  console.error('usage: tsx check-run.mts <runId>');
  process.exit(1);
}

async function main() {
  const r = await db.query.runs.findFirst({ where: eq(runs.id, RUN_ID) });
  if (!r) {
    console.error('Run not found');
    process.exit(1);
  }
  console.log('Run:', {
    id: r.id,
    status: r.status,
    mode: r.mode,
    packs: r.packs,
    target: r.targetLiveUrl,
    score: r.readinessScore,
    queuedAt: r.queuedAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
  });

  const events = await db.query.runEvents.findMany({
    where: eq(runEvents.runId, RUN_ID),
    orderBy: [desc(runEvents.createdAt)],
    limit: 20,
  });
  console.log(`\nEvents (${events.length}):`);
  for (const e of events.reverse()) {
    console.log(`  ${e.createdAt?.toISOString()}  ${e.type}  ${e.message ?? ''}`);
  }

  const findings = await db.query.runFindings.findMany({
    where: eq(runFindings.runId, RUN_ID),
  });
  console.log(`\nFindings (${findings.length}):`);
  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.probeId ?? '(no probe id)'}  ${f.title}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
