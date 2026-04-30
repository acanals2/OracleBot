import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-config';
import { ensureActiveOrgForUser, listUserOrgs } from '@/lib/auth';

/**
 * Group layout for /app/* routes — enforces signed-in + has-an-active-org.
 *
 * If signed in but no org membership exists yet, we auto-create a personal
 * one so brand-new users land in a working workspace. If they belong to
 * orgs but the session has no `activeOrganizationId` set, we point them at
 * `/app/create-org` to pick or create one.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user) {
    redirect('/sign-in');
  }

  const userId = session.user.id;
  const activeOrgId = session.session?.activeOrganizationId;

  if (!activeOrgId) {
    // Try to find an existing org. If none, create a personal one.
    const orgs = await listUserOrgs(userId);
    if (orgs.length === 0) {
      // Auto-create. ensureActiveOrgForUser uses Better Auth's API so the
      // member row + role assignment land atomically.
      try {
        const newOrgId = await ensureActiveOrgForUser(userId);
        // Set it active for this session.
        await auth.api.setActiveOrganization({
          headers: reqHeaders,
          body: { organizationId: newOrgId },
        });
      } catch {
        redirect('/app/create-org');
      }
      // Refresh — the cookie now holds the new active-org id.
      redirect('/app');
    }
    // User has orgs but none active — set the first as active and reload.
    try {
      await auth.api.setActiveOrganization({
        headers: reqHeaders,
        body: { organizationId: orgs[0].id },
      });
    } catch {
      redirect('/app/create-org');
    }
    redirect('/app');
  }

  return <>{children}</>;
}
