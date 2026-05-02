// Mint a test token so we can smoke the action against the local platform.
import { config } from 'dotenv';
config({ path: '.env.local', debug: false, quiet: true });
import { db } from '../../lib/db';
import { members } from '../../lib/db/schema';
import { createApiToken } from '../../lib/api-tokens';

async function main() {
  const ms = await db.select({ orgId: members.organizationId, userId: members.userId }).from(members).limit(50);
  // Find the org with a recent run, since it has a verified target.
  // Hardcoded match for the verification we seeded earlier.
  const targetOrgId = 'qrTq6ZCCaGwlPKVi7HCgHbhYbqLQuOmG';
  const m = ms.find((x) => x.orgId === targetOrgId);
  if (!m) { console.error('no member found for that org'); process.exit(1); }
  const { raw } = await createApiToken({
    orgId: m.orgId,
    userId: m.userId,
    name: 'github-action-smoketest',
  });
  process.stdout.write(raw);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
