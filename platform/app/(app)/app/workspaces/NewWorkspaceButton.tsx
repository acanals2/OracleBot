'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Plus } from 'lucide-react';

export function NewWorkspaceButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    const name = window.prompt('Workspace name', 'Untitled workspace')?.trim();
    if (!name) {
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? 'Failed to create workspace.');
      }
      router.push(`/app/workspaces/${json.data.workspace.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={onClick} disabled={busy}>
        <Plus className="mr-1 h-4 w-4" />
        {busy ? 'Creating…' : 'New workspace'}
      </Button>
      {error && <p className="text-xs text-ob-danger">{error}</p>}
    </div>
  );
}
