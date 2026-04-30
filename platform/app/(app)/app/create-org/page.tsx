import { CreateOrgForm } from './CreateOrgForm';

export const metadata = { title: 'Create workspace' };

export default function CreateOrgPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ob-bg p-4">
      <div className="w-full max-w-md rounded-2xl border border-ob-line bg-ob-surface p-8 shadow-card">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ob-signal">
          Step 1 of 1
        </p>
        <h1 className="mt-3 font-display text-2xl text-ob-ink">Create your workspace</h1>
        <p className="mt-3 text-sm text-ob-muted">
          Workspaces organize runs, billing, and team access. You can rename it later or invite
          teammates from the dashboard.
        </p>
        <div className="mt-6">
          <CreateOrgForm />
        </div>
      </div>
    </div>
  );
}
