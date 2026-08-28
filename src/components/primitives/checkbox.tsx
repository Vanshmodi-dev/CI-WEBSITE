import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A labelled checkbox — the ONLY one in this project.
 *
 * =============================================================================
 * WHY THIS EXISTS
 * =============================================================================
 * Phase 16 Topic 11 measured every interactive control in the product against
 * the 24x24 minimum in WCAG 2.2 AA (2.5.8) — the same rule `verify-ux.mjs` has
 * asserted on the public site since Phase 11. Every checkbox failed, in two
 * different sizes:
 *
 *   h-4 w-4  (16px)  enquiry consent, students, stories, batches, announcements
 *   h-5 w-5  (20px)  faculty, gallery, videos, the website editor
 *
 * Eleven hand-written copies, two sizes, two corner radii and two label
 * structures — which is exactly how a control ends up with no size anybody
 * decided on.
 *
 * The reason no test caught it is worth recording: the touch-target check
 * selected `a[href], button, input[type=submit]`. No checkbox was ever in the
 * query, so the suite reported PASS on every route while the smallest control
 * on the page was 16px. A green test that never evaluated the condition is
 * worse than no test, because it stops anybody looking.
 *
 * The one that mattered most was public: the consent checkbox on the enquiry
 * form. It is the control a parent on a phone MUST tick to send an enquiry, it
 * governs consent, and it was the smallest thing on the page.
 *
 * =============================================================================
 * WHY THE WHOLE ROW IS THE TARGET
 * =============================================================================
 * The box is 24x24, which meets the rule on its own. But the `<label>` WRAPS
 * the control, so the box, the wording and the explanation underneath are all
 * one hit area — usually a couple of hundred pixels wide. That is the part a
 * thumb actually finds.
 *
 * Wrapping also means the label needs no `htmlFor`/`id` pairing to be
 * associated, so there is no way to add one of these and forget the link.
 */
export function Checkbox({
  label,
  description,
  className,
  ...input
}: {
  /** The sentence next to the box. Always visible, never a placeholder. */
  label: ReactNode;
  /** The quieter line underneath, for what ticking it will actually do. */
  description?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'className'>) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 text-small text-text has-[:disabled]:cursor-not-allowed',
        className,
      )}
    >
      <input
        type="checkbox"
        className={
          // 24px: the WCAG 2.5.8 minimum, not a round number chosen by eye.
          // `mt-px` sits the box on the cap-height of the first line rather
          // than the line box, which is what makes it look aligned.
          'mt-px h-6 w-6 shrink-0 rounded-sm border-rule-strong accent-navy-800 ' +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-600 ' +
          // Stories and results disable this box until the consent boxes above
          // are ticked, so the disabled state has to be visible, not inferred.
          'disabled:cursor-not-allowed disabled:opacity-40'
        }
        {...input}
      />
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[13px] font-normal text-muted">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
