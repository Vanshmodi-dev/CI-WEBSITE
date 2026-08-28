import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * Admin UI primitives.
 *
 * Built on the SAME design tokens as the public site (docs/design/tokens.css) —
 * navy, the blue-biased neutrals, Source Serif for headings, IBM Plex Sans for
 * everything else. This is not a second design system; it is the same brand
 * doing a different job.
 *
 * The audience is one teacher, not a developer. Every label here is written in
 * plain words: "Show on website", not "publication state".
 */

/* ---------------------------------------------------------------- page ---- */

/**
 * `back` — the way out of a page you opened from a list.
 *
 * =============================================================================
 * WHY THIS IS A SLOT HERE RATHER THAN A LINK ON EACH PAGE
 * =============================================================================
 * Phase 18 measured every admin route, including the `[id]` edit pages that no
 * suite had ever looked at, and found that of the fifteen pages reached FROM a
 * list, exactly one offered a way back to it. That one — the enquiry detail
 * page — had hand-rolled `mb-4 inline-block text-small text-link`, which
 * measures 126x23 and is under the 24x24 minimum this project asserts on every
 * public page.
 *
 * The other fourteen relied on Cancel at the BOTTOM of the form, or on the
 * sidebar. On a phone the sidebar is behind a drawer and the bottom of a
 * student form is a long scroll away, so "go back to the list" — the single
 * most common thing a teacher does after looking at a record — was the
 * hardest movement in the admin on the device most likely to be used.
 *
 * One slot, so the fifteenth page cannot be different again.
 */
export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Where this page was opened from. Rendered above the title. */
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-rule pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {back ? (
          /*
            44px tall, matching every other standalone control in this admin.
            The arrow is `aria-hidden`: a screen reader announcing "left arrow
            Back to enquiries" reads a decoration as a word.
          */
          <Link
            href={back.href}
            className="mb-2 -ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-small font-medium text-muted transition-colors hover:text-heading"
          >
            <span aria-hidden="true">&larr;</span>
            {back.label}
          </Link>
        ) : null}
        <h1 className="font-display text-[26px] font-bold leading-tight text-heading">
          {title}
        </h1>
        {description ? (
          <p className="measure mt-1.5 text-small text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-rule bg-paper p-5 shadow-e1',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- status ---- */

/**
 * Status is never communicated by colour alone — each pill carries a glyph and
 * a word, so it still reads correctly in greyscale or with low colour vision.
 */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'published' | 'draft' | 'new' | 'done' | 'warn';
  children: ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    published: 'border-ok/40 bg-ok-bg text-ok',
    draft: 'border-rule-strong bg-surface text-muted',
    new: 'border-navy-600/30 bg-navy-50 text-navy-700',
    done: 'border-rule-strong bg-surface text-muted',
    warn: 'border-warn/40 bg-warn-bg text-warn',
  };
  const glyph: Record<typeof tone, string> = {
    published: '✓',
    draft: '•',
    new: '●',
    done: '✓',
    warn: '!',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-[12px] font-medium',
        styles[tone],
      )}
    >
      <span aria-hidden="true">{glyph[tone]}</span>
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- empty ---- */

export function EmptyPanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-rule-strong bg-surface px-6 py-14 text-center">
      <p className="font-display text-[18px] font-semibold text-heading">{title}</p>
      <p className="measure mx-auto mt-2 text-small text-muted">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- table ---- */

/**
 * A table in a horizontally scrollable container.
 *
 * MOST callers pair this with `hidden md:block` and render a stacked card list
 * at `md:hidden`, because a wide table is unreadable on a phone. The four
 * tables on `/admin/data` do not — they scroll instead, which is why the
 * container below has to be genuinely reachable.
 *
 * =============================================================================
 * WHY tabindex / role / aria-label (Phase 14)
 * =============================================================================
 * A `overflow-x-auto` div scrolls with a mouse or a finger. It does NOT scroll
 * with a keyboard unless it can take focus. Chrome has shipped focusable
 * scrollers, so this looked fine when tested there; Firefox and Safari have
 * not, and on those a keyboard-only user simply cannot reach the far columns.
 *
 * Phase 14 measured `/admin/data` at 360px: the container was 284px wide around
 * 452px of table, and the last heading — "What to write", the column that tells
 * a teacher how to fix their spreadsheet — sat off-screen with no keyboard path
 * to it.
 *
 * `tabindex={0}` makes it reachable, `role="region"` plus a name makes it
 * announceable, and together they are the standard pattern for a scrollable
 * table container. The cost is one extra tab stop on wide screens where the
 * table already fits, which is a fair price for the content being reachable at
 * all on the screens where it does not.
 */
export function TableShell({
  headings,
  label,
  children,
}: {
  headings: string[];
  /** Accessible name for the scrollable region. Say what the table lists. */
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-x-auto rounded-md border border-rule bg-paper"
      tabIndex={0}
      role="region"
      aria-label={label}
    >
      <table className="w-full text-left text-small">
        <thead>
          <tr className="border-b border-rule bg-surface">
            {headings.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>;
}

/* -------------------------------------------------------------- notice ---- */

/**
 * A banner above a form or list.
 *
 * =============================================================================
 * THE ROLE IS DERIVED FROM THE TONE, AND THAT MATTERS (Phase 14)
 * =============================================================================
 * This used to render a bare `<div>`. Every admin form reports its errors
 * through it: a teacher submits, the server rejects, React re-renders, and the
 * red banner appears — silently. Focus stays on the submit button, nothing is
 * announced, and a screen-reader user is left believing the click did nothing.
 * That is WCAG 4.1.3 Status Messages, on the primary admin workflow.
 *
 * The mapping is deliberate, not decorative:
 *
 *   danger -> role="alert"   assertive. An error interrupts, because the
 *                            teacher's next action depends on hearing it.
 *   ok     -> role="status"  polite. "Saved successfully" should be heard, but
 *                            not on top of whatever is being read.
 *   warn   -> role="status"  polite. "We could not load enquiries just now" is
 *                            a degraded state, not a failed action.
 *   info   -> NO ROLE        these are static explanatory panels that are
 *                            present on load ("This shows published content
 *                            only"). Giving them a live role would make a
 *                            screen reader announce page furniture every time,
 *                            which trains people to tune the region out — the
 *                            exact opposite of the point.
 */
export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: 'border-navy-600/30 bg-selected text-text',
    warn: 'border-warn/40 bg-warn-bg text-text',
    danger: 'border-danger/40 bg-danger-bg text-text',
    ok: 'border-ok/40 bg-ok-bg text-text',
  } as const;

  const role =
    tone === 'danger' ? 'alert' : tone === 'ok' || tone === 'warn' ? 'status' : undefined;

  return (
    <div
      role={role}
      className={cn('rounded-md border px-4 py-3 text-small', styles[tone])}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ quick nav ---- */

export function QuickAction({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-16 flex-col justify-center rounded-md border border-rule bg-paper px-4 py-3 transition-colors hover:border-navy-600/50 hover:bg-selected"
    >
      <span className="font-medium text-heading">{label}</span>
      {hint ? <span className="mt-0.5 text-[13px] text-muted">{hint}</span> : null}
    </Link>
  );
}
