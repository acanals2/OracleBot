/**
 * Tier adapter — gates how many workspaces an org can have based on its
 * subscription. Reads our existing `subscriptions` table.
 *
 * Defaults (free tier): 3 workspaces.
 * Studio:               20 workspaces.
 * Stack:                unlimited.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { subscriptions } from '@/lib/db/schema';

export async function getMaxWorkspacesForOrg(orgId: string): Promise<number> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.orgId, orgId),
  });
  if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) return 3;
  if (sub.productKey === 'stack') return Number.POSITIVE_INFINITY;
  if (sub.productKey === 'studio') return 20;
  return 3;
}
