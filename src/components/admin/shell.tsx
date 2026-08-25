'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { institute } from '@/config/institute';

/**
 * Admin shell — sidebar, header, mobile drawer.
 *
 * SIX navigation items, deliberately. Grouping them into sections would add a
 * layer of hierarchy for one person managing one small site; a flat list of six
 * is faster to scan than three groups of two.
 *
 * Client component only because of the mobile drawer. Every page inside it is a
 * server component.
 */

type NavItem = { href: string; label: string; exact?: boolean };

const NAV: readonly NavItem[] = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/enquiries', label: 'Enquiries' },
  { href: '/admin/students', label: 'Students & Results' },
  { href: '/admin/batches', label: 'Batches' },
  { href: '/admin/announcements', label: 'Announcements' },
  { href: '/admin/stories', label: 'Student Stories' },
  { href: '/admin/data', label: 'Data' },
  { href: '/admin/preview', label: 'Website preview' },
];

export function AdminShell({
  adminName,
  children,
}: {
  adminName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Drawer records which route it opened on, so navigating closes it during
  // render rather than in an effect that would flash over the new page.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath !== null && openPath === pathname;

  const current =
    NAV.find((i) => (i.exact ? pathname === i.href : pathname.startsWith(i.href)))
      ?.label ?? 'Admin';

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-rule bg-paper">
        <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpenPath(open ? null : pathname)}
              aria-expanded={open}
              aria-controls="admin-nav"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-heading hover:bg-surface lg:hidden"
            >
              <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'}
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>

            <div className="flex flex-col leading-none">
              <span className="font-display text-[17px] font-bold uppercase tracking-[0.01em] text-heading">
                {institute.name}
              </span>
              <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent-text">
                Admin
              </span>
            </div>

            <span className="ml-2 hidden border-l border-rule pl-4 text-small text-muted md:inline">
              {current}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-small text-muted sm:inline">
              Signed in as <strong className="text-text">{adminName}</strong>
            </span>
            {/* A real POST, so a stray link prefetch can never sign anyone out. */}
            <form action="/admin/logout" method="post">
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-sm border border-rule px-3 text-small text-text transition-colors hover:border-navy-600/50 hover:bg-selected"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px]">
        {/* Sidebar — desktop */}
        <nav
          aria-label="Admin sections"
          className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 border-r border-rule bg-paper px-3 py-6 lg:block"
        >
          <NavList pathname={pathname} />
        </nav>

        {/* Drawer — mobile */}
        {open ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              tabIndex={-1}
              onClick={() => setOpenPath(null)}
              className="absolute inset-0 bg-navy-950/50"
            />
            <nav
              id="admin-nav"
              aria-label="Admin sections"
              className="absolute inset-y-0 left-0 w-64 bg-paper px-3 py-6 shadow-e3"
            >
              <NavList pathname={pathname} />
            </nav>
          </div>
        ) : null}

        {/* id="main" is the skip link's target. The root layout no longer
            wraps routes in a <main>, so this is the page's only one - which
            also removed the two nested <main> landmarks that every signed-in
            admin page used to carry. */}
        <main
          id="main"
          className="min-w-0 flex-1 px-4 py-8 md:px-8 lg:px-10 lg:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function NavList({ pathname }: { pathname: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center rounded-sm px-3 text-small transition-colors',
                active
                  ? 'bg-selected font-medium text-heading'
                  : 'text-muted hover:bg-surface hover:text-heading',
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
