'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { organization } from '@/lib/auth-client';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const finalSlug = slug.trim() || slugify(name);
      const result = await organization.create({ name, slug: finalSlug });
      if (result.error) throw new Error(result.error.message ?? 'Could not create workspace.');
      // Switch to the new org so requireSession() finds it.
      if (result.data?.id) {
        await organization.setActive({ organizationId: result.data.id });
      }
      router.push('/app');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Workspace name</Label>
        <Input
          id="name"
          placeholder="Acme Trading"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slug) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">URL slug</Label>
        <Input
          id="slug"
          placeholder={slugify(name) || 'acme-trading'}
          value={slug}
          onChange={(e) => setSlug(slugify(e.target.value))}
        />
        <p className="text-[11px] text-ob-dim">
          Lowercase letters, numbers, hyphens. Used in URLs and invite links.
        </p>
      </div>
      {error && (
        <div className="rounded-lg border border-ob-danger/40 bg-ob-danger/10 p-3 text-xs text-ob-danger">
          {error}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Creating…' : 'Create workspace'}
      </Button>
    </form>
  );
}
