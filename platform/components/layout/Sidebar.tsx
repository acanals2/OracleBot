'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Code2,
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  List,
  PlusCircle,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/app/tests/new', label: 'New test', icon: PlusCircle, exact: false },
  { href: '/app/tests', label: 'All runs', icon: List, exact: false },
  { href: '/app/workspaces', label: 'Workspaces', icon: Code2, exact: false },
  { href: '/app/settings/domains', label: 'Domains', icon: Globe, exact: false },
  { href: '/app/settings/api-tokens', label: 'API tokens', icon: KeyRound, exact: false },
  { href: '/app/settings/integrations', label: 'Integrations', icon: Webhook, exact: false },
  { href: '/app/billing', label: 'Billing', icon: CreditCard, exact: false },
];

function isActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

export function Sidebar() {
  const pathname = usePathname() ?? '';
  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-56 flex-col border-r border-ob-line bg-ob-bg/95 backdrop-blur-md">
      <div className="flex items-center gap-2 border-b border-ob-line px-4 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-ob-signal/40 bg-ob-signal/10 font-mono text-sm font-bold text-ob-signal">
          OB
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-ob-ink">Oracle Bot</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ob-dim">Control plane</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-ob-surface text-ob-signal'
                  : 'text-ob-muted hover:bg-ob-surface/60 hover:text-ob-ink',
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-ob-line p-2">
        <Link
          href="/safety"
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
            isActive(pathname, '/safety', false)
              ? 'bg-ob-surface text-ob-signal'
              : 'text-ob-muted hover:bg-ob-surface/60 hover:text-ob-ink',
          )}
        >
          <ShieldCheck className="h-4 w-4" />
          Safety &amp; compliance
        </Link>
      </div>
    </aside>
  );
}
