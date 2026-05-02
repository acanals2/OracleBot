import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../lib/db';
import { runs, runEvents } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

const RUN_ID = process.argv[2];
if (!RUN_ID) {
  console.error('usage: tsx cancel-run.mts <runId>');
  process.exit(1);
}

async function main() {
  await db
    .update(runs)
    .set({ status: 'canceled', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(runs.id, RUN_ID));
  await db.insert(runEvents).values({
    runId: RUN_ID,
    type: 'run_canceled',
    message: 'Canceled by tester (wrong target).',
  });
  console.log(`Canceled run ${RUN_ID}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
