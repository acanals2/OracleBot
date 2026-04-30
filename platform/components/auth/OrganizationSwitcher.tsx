'use client';

/**
 * Lightweight organization switcher. Lists the orgs the current user belongs
 * to + a sign-out button + a "+ New workspace" link. Shows in the dashboard
 * top-right where Clerk's `<OrganizationSwitcher />` used to live.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, LogOut, Plus } from 'lucide-react';
import {
  organization,
  signOut,
  useActiveOrganization,
  useListOrganizations,
} from '@/lib/auth-client';

export function OrganizationSwitcher() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const { data: active } = useActiveOrganization();
  const { data: orgs } = useListOrganizations();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function switchTo(orgId: string) {
    await organization.setActive({ organizationId: orgId });
    setOpen(false);
    router.refresh();
  }

  async function doSignOut() {
    await signOut();
    router.push('/');
    router.refresh();
  }

  const label = active?.name ?? 'Workspace';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-ob-line bg-ob-surface px-3 py-1.5 text-xs text-ob-ink transition-colors hover:border-ob-signal/40"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Building2 className="h-3.5 w-3.5 text-ob-signal" />
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 overflow-hidden rounded-xl border border-ob-line-strong bg-ob-surface/95 shadow-card backdrop-blur-xl">
          <div className="border-b border-ob-line bg-ob-bg/40 px-4 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ob-dim">
              Workspaces
            </p>
          </div>
          <ul className="max-h-[280px] overflow-y-auto p-2">
            {(orgs ?? []).map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => switchTo(o.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-ob-bg/60 ${
                    active?.id === o.id ? 'text-ob-signal' : 'text-ob-ink'
                  }`}
                >
                  <Building2 className="h-3.5 w-3.5 flex-none opacity-70" />
                  <span className="truncate">{o.name}</span>
                  {active?.id === o.id && (
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-ob-signal">
                      active
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-ob-line p-2">
            <Link
              href="/app/create-org"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ob-muted transition-colors hover:bg-ob-bg/60 hover:text-ob-ink"
            >
              <Plus className="h-3.5 w-3.5" />
              New workspace
            </Link>
            <button
              type="button"
              onClick={doSignOut}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ob-muted transition-colors hover:bg-ob-bg/60 hover:text-ob-danger"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
