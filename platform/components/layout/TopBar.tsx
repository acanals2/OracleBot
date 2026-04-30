import { Bell, Search } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { OrganizationSwitcher } from '../auth/OrganizationSwitcher';

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-ob-line bg-ob-bg/80 px-8 py-4 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-normal tracking-tight text-ob-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ob-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-1 items-center justify-end gap-3 md:max-w-xl">
          <div className="relative hidden flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ob-dim" />
            <Input placeholder="Search tests, reports…" className="h-9 pl-9" />
          </div>
          <Button variant="ghost" size="sm" className="px-2" aria-label="Notifications">
            <Bell className="h-4 w-4" />
          </Button>
          <OrganizationSwitcher />
        </div>
      </div>
    </header>
  );
}
