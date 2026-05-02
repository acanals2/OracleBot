// Confirm migration 0005 is applied: check that the new enum values exist
// and that runs.packs / run_findings.probe_id columns are present.
import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../../lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  const enumValues = await db.execute(sql`
    SELECT enumlabel FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'finding_category')
    ORDER BY enumsortorder
  `);
  const labels = (enumValues.rows ?? enumValues).map((r: any) => r.enumlabel);
  console.log('finding_category enum values:');
  console.log(labels.join(', '));

  const newOnes = [
    'exposed_secret', 'missing_rls', 'client_key_leak', 'tool_poisoning',
    'pii_echo', 'schema_violation', 'capability_escalation', 'credential_in_tool_desc',
  ];
  const missing = newOnes.filter((v) => !labels.includes(v));
  console.log(`Phase 10 enum values present: ${missing.length === 0 ? 'YES' : 'MISSING ' + missing.join(',')}`);

  const cols = await db.execute(sql`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'runs' AND column_name = 'packs')
        OR (table_name = 'run_findings' AND column_name = 'probe_id'))
  `);
  const colList = (cols.rows ?? cols).map((r: any) => `${r.table_name}.${r.column_name}`);
  console.log(`\nPhase 10 columns: ${colList.join(', ') || '(none)'}`);

  const journal = await db.execute(sql`
    SELECT hash, created_at FROM "drizzle"."__drizzle_migrations"
    ORDER BY created_at DESC LIMIT 5
  `).catch(() => null);
  if (journal) {
    console.log('\nDrizzle migrations applied (most recent 5):');
    for (const r of (journal.rows ?? journal)) {
      console.log(`  ${r.created_at}  ${(r.hash as string).slice(0, 8)}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
