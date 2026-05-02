// Throwaway: list orgs ranked by latest run + most recent session active orgs
// so we know which org id the wizard will submit a run under.
import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  const runs = await db.execute(sql`
    SELECT org_id, COUNT(*) AS run_count, MAX(created_at) AS latest
    FROM runs
    GROUP BY org_id
    ORDER BY latest DESC NULLS LAST
    LIMIT 5
  `);
  console.log('Recent runs by org:');
  console.log(JSON.stringify(runs.rows ?? runs, null, 2));

  const sessions = await db.execute(sql`
    SELECT user_id, active_organization_id, expires_at
    FROM sessions
    ORDER BY expires_at DESC
    LIMIT 5
  `);
  console.log('\nRecent sessions:');
  console.log(JSON.stringify(sessions.rows ?? sessions, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
