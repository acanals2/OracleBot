import { notFound } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import {
  loadWorkspaceForRequest,
  WorkspaceForbiddenError,
  WorkspaceNotFoundError,
} from '@/lib/workspaces';
import { ensureWorkspace, listWorkspaceFiles } from '@/lib/oracle-workspace';
import { WorkspaceShell } from './WorkspaceShell';

type Params = Promise<{ id: string }>;

export default async function WorkspaceDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  let workspaceName = 'Workspace';
  try {
    const { workspace } = await loadWorkspaceForRequest(id);
    workspaceName = workspace.name;
    await ensureWorkspace(id);
  } catch (e) {
    if (e instanceof WorkspaceNotFoundError) notFound();
    if (e instanceof WorkspaceForbiddenError) notFound();
    throw e;
  }

  const initialFiles = await listWorkspaceFiles(id).catch(() => []);

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title={workspaceName}
          subtitle={`Workspace ${id.slice(0, 8)} · launch a sandboxed preview`}
        />
        <div className="flex-1 p-8">
          <WorkspaceShell workspaceId={id} initialFiles={initialFiles} />
        </div>
      </div>
    </div>
  );
}
