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

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-rule pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
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
 * On mobile a wide table becomes unreadable, so the caller renders a stacked
 * card list instead. This wrapper is desktop-only by design — see the `hidden
 * md:block` on its usages.
 */
export function TableShell({
  headings,
  children,
}: {
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-rule bg-paper">
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
    info: 'border-navy-600/30 bg-navy-50 text-text',
    warn: 'border-warn/40 bg-warn-bg text-text',
    danger: 'border-danger/40 bg-danger-bg text-text',
    ok: 'border-ok/40 bg-ok-bg text-text',
  } as const;
  return (
    <div className={cn('rounded-md border px-4 py-3 text-small', styles[tone])}>
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
      className="flex min-h-16 flex-col justify-center rounded-md border border-rule bg-paper px-4 py-3 transition-colors hover:border-navy-600/50 hover:bg-navy-50"
    >
      <span className="font-medium text-heading">{label}</span>
      {hint ? <span className="mt-0.5 text-[13px] text-muted">{hint}</span> : null}
    </Link>
  );
}
