import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowRight, Code2, Plus } from 'lucide-react';
import { requireSession } from '@/lib/auth';
import { listWorkspacesForOrg } from '@/lib/workspaces';
import { NewWorkspaceButton } from './NewWorkspaceButton';

export default async function WorkspacesPage() {
  const session = await requireSession();
  const rows = await listWorkspacesForOrg(session.org.id).catch(() => []);

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="Workspaces"
          subtitle={`${session.org.name} · launch a sandboxed preview of any codebase`}
        />
        <div className="flex-1 space-y-6 p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-ob-muted">
              {rows.length === 0
                ? 'No workspaces yet. Create one to launch a sandboxed preview.'
                : `${rows.length} workspace${rows.length === 1 ? '' : 's'}`}
            </p>
            <NewWorkspaceButton />
          </div>

          {rows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
                <Code2 className="h-12 w-12 text-ob-signal opacity-60" />
                <div>
                  <p className="font-display text-lg text-ob-ink">No workspaces yet</p>
                  <p className="mt-2 max-w-md text-sm text-ob-muted">
                    A workspace is an isolated codebase sandbox. We seed a starter Next.js app
                    so you can launch a live preview in under a minute, then edit files via the
                    workspace API as the AI fix loop comes online.
                  </p>
                </div>
                <NewWorkspaceButton />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((w) => (
                <Card key={w.id} className="transition-colors hover:border-ob-signal/30">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{w.name}</span>
                      <Code2 className="h-4 w-4 text-ob-signal opacity-70" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">
                      {w.lastOpenedAt
                        ? `Last opened ${new Date(w.lastOpenedAt).toLocaleDateString()}`
                        : `Created ${new Date(w.createdAt).toLocaleDateString()}`}
                    </p>
                    <Link href={`/app/workspaces/${w.id}`}>
                      <Button size="sm" variant="secondary" className="w-full">
                        Open <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
