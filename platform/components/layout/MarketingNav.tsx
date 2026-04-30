'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '../ui/Button';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MODES } from '@/data/modes';

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Auto-close dropdown on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-ob-line bg-ob-bg/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-ob-signal/40 bg-ob-signal/10 font-mono text-sm font-bold text-ob-signal">
            OB
          </span>
          <span className="text-sm font-semibold tracking-tight text-ob-ink">Oracle Bot</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <div ref={wrapRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 text-sm text-ob-muted transition-colors hover:text-ob-ink"
              aria-expanded={open}
              aria-haspopup="menu"
            >
              Modes
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute left-1/2 top-[calc(100%+12px)] w-[420px] -translate-x-1/2 overflow-hidden rounded-2xl border border-ob-line-strong bg-ob-surface/95 shadow-card backdrop-blur-xl"
              >
                <div className="border-b border-ob-line bg-ob-bg/40 px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ob-signal">
                    Unified bot architecture
                  </p>
                  <p className="mt-1 text-xs text-ob-muted">
                    One platform. Four surfaces. Same sandbox.
                  </p>
                </div>
                <ul className="p-2">
                  {MODES.map((m) => {
                    const Icon = m.icon;
                    return (
                      <li key={m.slug}>
                        <Link
                          href={`/modes/${m.slug}`}
                          className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-ob-bg/60"
                          role="menuitem"
                        >
                          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-ob-line bg-ob-bg/60 text-ob-signal">
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-ob-ink">{m.tag}</span>
                              {m.signature && (
                                <span className="rounded-full border border-ob-signal/40 bg-ob-signal/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-ob-signal">
                                  Signature
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-ob-muted">
                              {m.slug === 'site' && 'Test what your users see'}
                              {m.slug === 'agent' && 'Test what your agent says'}
                              {m.slug === 'api' && 'Test what your endpoints handle'}
                              {m.slug === 'stack' && 'Test your full AI product end-to-end'}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <Link href="/safety" className="text-sm text-ob-muted hover:text-ob-ink">
            Trust
          </Link>
          <a href="/#pricing" className="text-sm text-ob-muted hover:text-ob-ink">
            Pricing
          </a>
          <a
            href="/sample-readiness-report.html"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-ob-muted hover:text-ob-ink"
          >
            Sample report
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/safety">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
              <ShieldCheck className="mr-1 h-4 w-4" />
              Trust
            </Button>
          </Link>
          <Link href="/app">
            <Button variant="secondary" size="sm">
              Dashboard
            </Button>
          </Link>
          <Link href="/app/tests/new">
            <Button size="sm">Run a test</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
