import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { NewRunWizard } from './NewRunWizard';

export default function NewTestPage() {
  return (
    <div className="flex min-h-screen bg-ob-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-56">
        <TopBar
          title="New test"
          subtitle="Connect a target → pick a mode → launch. Air-gapped sandbox by default."
        />
        <div className="flex-1 p-8">
          <div className="mx-auto max-w-4xl">
            <NewRunWizard />
          </div>
        </div>
      </div>
    </div>
  );
}
