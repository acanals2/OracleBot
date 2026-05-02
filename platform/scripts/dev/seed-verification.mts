/**
 * One-shot testing affordance: seed a `verified` target_verifications row for
 * `oraclebot.net` against the user's primary org so the badge / score-page
 * pipeline can be exercised end-to-end during Batch 1.
 *
 * NOT a production tool. Production verification of oraclebot.net should go
 * through the proper well-known-file flow once `.oraclebot.net` is removed
 * from the carve-out suffix list (Batch 2 prep).
 *
 * Usage:
 *   cd platform
 *   npx tsx scripts/seed-oraclebot-verification.mts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../lib/db';
import { targetVerifications, orgs } from '../lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'node:crypto';

// Default target swapped from oraclebot.net (currently parked on a different
// product) to the dev marketing-site deploy we actually control. Override
// with the first CLI arg if needed.
const DOMAIN = process.argv[2] ?? 'oracle-bot-seven.vercel.app';

async function main() {
  const orgRows = await db.select().from(orgs).orderBy(desc(orgs.createdAt)).limit(5);
  if (orgRows.length === 0) {
    console.error('No orgs found in the DB. Sign up at /sign-in first, then re-run.');
    process.exit(1);
  }

  console.log('Available orgs:');
  for (const o of orgRows) console.log(`  ${o.id}  ${o.slug ?? '(no slug)'}  ${o.name}`);

  // Target the most recently created org — that's typically the dev account.
  const target = orgRows[0];
  console.log(`\nSeeding verified row for "${DOMAIN}" → org ${target.id} (${target.name}).`);

  const existing = await db.query.targetVerifications.findFirst({
    where: and(eq(targetVerifications.orgId, target.id), eq(targetVerifications.domain, DOMAIN)),
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const token = crypto.randomBytes(24).toString('base64url');

  if (existing) {
    await db
      .update(targetVerifications)
      .set({
        status: 'verified',
        verifiedAt: now,
        expiresAt,
        lastCheckedAt: now,
        lastError: null,
        updatedAt: now,
        method: 'well_known_file',
      })
      .where(eq(targetVerifications.id, existing.id));
    console.log(`Updated existing verification id=${existing.id}`);
    console.log(`Score URL: /score/${existing.id}`);
    console.log(`Badge URL: /api/badge/${existing.id}.svg`);
    return;
  }

  const [created] = await db
    .insert(targetVerifications)
    .values({
      orgId: target.id,
      domain: DOMAIN,
      challengeToken: token,
      method: 'well_known_file',
      status: 'verified',
      verifiedAt: now,
      expiresAt,
      lastCheckedAt: now,
    })
    .returning();
  console.log(`Created verification id=${created.id}`);
  console.log(`Score URL: /score/${created.id}`);
  console.log(`Badge URL: /api/badge/${created.id}.svg`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
