import { notFound } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { requireSession } from '@/lib/auth';
import { getRunWithDetails } from '@/lib/runs';
import { LiveRunProvider } from '@/components/run/LiveRunProvider';
import { LiveDashboard } from '@/components/run/LiveDashboard';

type Params = Promise<{ testId: string }>;

export default async function LiveTestPage({ params }: { params: Params }) {
  const { testId } = await params;
  const session = await requireSession();
  const detail = await getRunWithDetails(session.org.id, testId);
  if (!detail) notFound();
  const { run, events, metrics, findings } = detail;

  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title={run.name}
          subtitle={`Run ${run.id.slice(0, 8)} · ${run.mode} mode · status ${run.status}`}
        />
        <div className="flex-1 space-y-6 p-8">
          <LiveRunProvider runId={run.id} initial={{ run, metrics, events, findings }}>
            <LiveDashboard />
          </LiveRunProvider>
        </div>
      </div>
    </div>
  );
}
