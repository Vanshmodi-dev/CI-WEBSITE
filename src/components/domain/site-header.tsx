'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDrawer } from '@/components/primitives/use-drawer';
import { cn } from '@/lib/cn';
import { institute } from '@/config/institute';
import type { ResolvedNavLink } from '@/lib/site-content';
import { Button } from '@/components/primitives/button';
import { LogoLockup } from '@/components/domain/logo';

/**
 * SiteHeader — Master Plan §21.
 *
 * One of only a handful of client components in the app (§10); everything else
 * is server-rendered. The interactivity here is the mobile drawer.
 *
 * Mobile: logo + call icon + hamburger. The drawer pins Enquire at the BOTTOM,
 * in thumb reach — the top of a full-height drawer is the hardest place to
 * reach one-handed, and Enquire is the action we most want tapped.
 */
/**
 * The menu and the phone number now arrive as PROPS, resolved on the server.
 *
 * This component is a client component because of the drawer, and a client
 * component cannot read the database. Importing `primaryNav` and `telHref`
 * directly, as it used to, meant the header could only ever show what was
 * hardcoded — so a teacher renaming "Updates" to "News" in the admin would see
 * it change everywhere except the one place every visitor looks first.
 *
 * `(site)/layout.tsx` resolves both once per request and passes them down.
 */
export function SiteHeader({
  nav,
  phoneDisplay,
  telHref,
}: {
  nav: readonly ResolvedNavLink[];
  phoneDisplay: string;
  telHref: string;
}) {
  const pathname = usePathname();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * The drawer records WHICH route it was opened on, and is open only while
   * that still matches. Navigating therefore closes it during render, with no
   * effect and no cascading re-render — an effect that called setState here
   * would fire after paint, so the drawer would flash over the new page.
   */
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath !== null && openPath === pathname;

  const setOpen = (next: boolean) => setOpenPath(next ? pathname : null);

  const dialogRef = useRef<HTMLDivElement>(null);

  /*
    ELEVATION ON SCROLL, AND THE CHEAPEST POSSIBLE VERSION OF IT.

    At the top of a page the header is part of the page: a hairline, no shade,
    nothing separating it from the section it sits on. Once the page moves it
    becomes a surface floating over content, and it says so with a shadow.

    This is the only scroll listener on the public site, so it is written the
    way one should be: passive, reading a number nobody can make expensive, and
    setting state ONLY when the boolean actually flips - so a full scroll of a
    long page schedules two renders, not two hundred. 8px rather than 0 keeps
    a trackpad's elastic overscroll from flickering it.
  */
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const past = window.scrollY > 8;
      setScrolled((current) => (current === past ? current : past));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /*
    Escape closes and returns focus; Tab stays inside; the page behind does not
    scroll. The implementation moved to `primitives/use-drawer.ts` in Topic 11
    so the ADMIN drawer could have it too - it had none of this, which nobody
    had noticed because only the public drawer was ever measured. The reasoning
    that used to live here lives there now, unchanged.
  */
  const closeDrawer = useCallback(() => setOpenPath(null), []);
  useDrawer({
    open,
    onClose: closeDrawer,
    dialogRef,
    triggerRef,
    initialFocusRef: closeButtonRef,
  })

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-50 border-b bg-paper/85 backdrop-blur-md',
          'transition-[border-color,box-shadow,background-color] duration-[var(--duration-base)] ease-brand',
          scrolled
            ? 'border-rule shadow-e1 bg-paper/95'
            : 'border-transparent shadow-none',
        )}
      >
        <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-[76px]">
          <LogoLockup priority />

          {/* Desktop navigation — appears at lg, per §21 */}
          <nav aria-label="Primary" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {nav.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'nav-link',
                        active
                          ? 'font-semibold text-heading'
                          : 'font-medium text-muted hover:bg-surface hover:text-heading',
                      )}
                    >
                      {item.label}
                      {/* The active indicator is the one orange element in the
                        header. It is a rule, not text — the logo orange is
                        safe as a fill and fails AA as text on white. */}
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-3.5 bottom-1.5 h-[2px] rounded-full bg-accent"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            {/* Parents call; they do not fill forms (Master Plan §06). The
              number is reachable from every page at every breakpoint. */}
            <a
              href={telHref}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-heading lg:px-4"
              aria-label={`Call ${institute.name} on ${phoneDisplay}`}
            >
              <PhoneIcon />
              <span className="ml-2 hidden text-[15px] xl:inline">
                {phoneDisplay}
              </span>
            </a>

            <Button href="/admissions" className="hidden lg:inline-flex">
              Enquire
            </Button>

            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-heading transition-colors hover:bg-surface lg:hidden"
            >
              <span className="sr-only">Open menu</span>
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>

      {/*
        ⚠ THE DRAWER MUST NOT BE RENDERED INSIDE <header>.

        It used to be, and Phase 11 measured the result: the overlay is
        `position: fixed; inset: 0`, but a `backdrop-filter` on an ancestor
        makes that ancestor the containing block for fixed descendants. The
        header carries `backdrop-blur-sm`, so the "full-screen" overlay was
        clamped to the header box — 64px tall on a 844px phone.

        The visible consequence: the drawer opened 64px high, its nav list
        was crushed to 32px and clipped, four of the six links were
        unreachable, and the pinned Enquire block painted on top of the
        ones that were left. On a site whose only navigation below `lg` is
        this drawer, that made the phone experience unusable.

        Nothing about the markup looked wrong, which is why it survived to
        Phase 11: every assertion about the drawer had checked that things
        EXISTED. Presence is not usability.
      */}
      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy-950/50"
          />
          <div
            ref={dialogRef}
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-paper shadow-e3"
          >
            <div className="flex h-16 items-center justify-between border-b border-rule px-5">
              <LogoLockup />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-heading hover:bg-surface"
              >
                <span className="sr-only">Close menu</span>
                <CloseIcon />
              </button>
            </div>

            <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="flex flex-col">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href} className="border-b border-rule/70">
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-14 items-center text-[17px]',
                          active ? 'font-medium text-heading' : 'text-text',
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Pinned in thumb reach */}
            <div className="border-t border-rule bg-surface px-5 py-4">
              <Button href="/admissions" size="lg" className="w-full">
                Enquire now
              </Button>
              <a
                href={telHref}
                className="mt-3 flex min-h-11 items-center justify-center gap-2 text-[15px] text-link"
              >
                <PhoneIcon />
                {phoneDisplay}
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* Inline icons — no icon library. A dependency for four glyphs would cost
   more than it saves (Master Plan §18). */

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
