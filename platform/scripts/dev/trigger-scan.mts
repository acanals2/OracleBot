/**
 * Throwaway: programmatically create + enqueue a scan against oraclebot.net
 * for Batch 1 testing. Bypasses the wizard so we don't need a live session.
 *
 * Picks the most-recently-created org (the one we just seeded a verification
 * row for) and the most recent user in that org as createdBy.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../lib/db';
import { orgs, members, runs } from '../lib/db/schema';
import { sql, eq, desc } from 'drizzle-orm';
import { createRun } from '../lib/runs';
import { enqueueExecuteRun } from '../lib/queue';

const TARGET_ORG_ID = 'qrTq6ZCCaGwlPKVi7HCgHbhYbqLQuOmG';
// Target switched to the dev marketing-site deploy (oraclebot.net is parked
// on a different product right now). Override via CLI arg.
const TARGET_URL = process.argv[2] ?? 'https://oracle-bot-seven.vercel.app';

async function main() {
  const memberRows = await db
    .select()
    .from(members)
    .where(eq(members.organizationId, TARGET_ORG_ID))
    .limit(5);
  if (memberRows.length === 0) {
    console.error(`No members found for org ${TARGET_ORG_ID}`);
    process.exit(1);
  }
  const userId = memberRows[0].userId;
  console.log(`Creating run for org ${TARGET_ORG_ID} by user ${userId}`);

  const run = await createRun({
    orgId: TARGET_ORG_ID,
    userId,
    costCentsEstimated: 0,
    input: {
      mode: 'site',
      name: `oraclebot.net · ai_built_apps + web_classics · ${new Date().toISOString().slice(0, 16)}`,
      productKey: 'free',
      botCount: 5,
      durationMinutes: 3,
      target: { kind: 'liveUrl', url: TARGET_URL },
      packs: ['web_classics', 'ai_built_apps'],
      hardCapCents: 5000,
      idempotencyKey: `oraclebot-batch1-${Date.now()}`,
    },
  });

  console.log(`Created run id=${run.id} status=${run.status}`);
  await enqueueExecuteRun({ runId: run.id });
  console.log(`Enqueued. Watch worker logs.`);
  console.log(`Live: http://localhost:3100/app/tests/${run.id}/live`);
  console.log(`Results: http://localhost:3100/app/tests/${run.id}/results`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
