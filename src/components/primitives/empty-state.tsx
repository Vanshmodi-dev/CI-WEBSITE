import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * EmptyState — Master Plan §10.
 *
 * Not an edge case on this project. Several homepage bands launch with no data
 * because the evidence behind them is still being collected (Master Plan §22),
 * and the content-integrity rule forbids filling the gap with something
 * plausible. So the empty state is a designed component, not an `if` branch.
 *
 * THE DEFAULT IS TO RENDER NOTHING. `<Hidden>` below is the honest answer for
 * a public band with no data: an empty results section is worse than no results
 * section. Use this visible variant only where the reader has actively
 * navigated somewhere and silence would read as a broken page — a filtered
 * list that matched nothing, for example.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-md border border-dashed border-rule',
        'bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <p className="font-display text-h3 font-semibold text-heading">{title}</p>
      {description ? (
        <p className="measure mt-2 text-small text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/**
 * The preferred handling for a band with no data yet: render nothing at all,
 * and leave a comment in the DOM so it is obvious during review that the band
 * is waiting on content rather than missing by accident.
 */
export function Hidden({ reason }: { reason: string }) {
  return (
    <>
      {/* Band intentionally not rendered — {reason} */}
      {process.env.NODE_ENV === 'development' ? (
        <div
          data-dev-only
          className="border-y border-dashed border-warn/40 bg-warn-bg px-5 py-3 text-center text-small text-warn"
        >
          <strong>Dev only:</strong> band hidden — {reason}
        </div>
      ) : null}
    </>
  );
}
