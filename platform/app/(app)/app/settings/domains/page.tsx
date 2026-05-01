/**
 * Domain verification settings page. Lists every verification record the
 * org has created, lets the user start a new challenge, and lets them
 * trigger the lookup to flip pending → verified.
 *
 * Server component for the initial paint; the interactive bits (start
 * challenge, copy token, run check) are in the DomainsClient component.
 */
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { requireSession } from '@/lib/auth';
import { listVerificationsForOrg } from '@/lib/target-verification';
import { DomainsClient } from './DomainsClient';

export default async function DomainsPage() {
  const session = await requireSession();
  const initial = await listVerificationsForOrg(session.org.id);

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="Domain verification"
          subtitle={`${session.org.name} · prove ownership of the targets you test`}
        />
        <div className="flex-1 space-y-6 p-8">
          <DomainsClient initial={initial} />
        </div>
      </div>
    </div>
  );
}
