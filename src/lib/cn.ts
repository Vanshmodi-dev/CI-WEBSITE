import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * ⚠ WHY THIS IS NOT JUST `twMerge(clsx(...))` ANY MORE — PHASE 25.
 *
 * tailwind-merge resolves conflicts by putting each class in a GROUP and
 * keeping the last one. It knows the groups for Tailwind's own scale, and it
 * guesses for anything custom. This project's type scale is custom — `text-h2`,
 * `text-small`, `text-display` — and every one of those was being guessed into
 * the TEXT COLOUR group, because that is what `text-<word>` usually means.
 *
 * The consequence, which shipped: `cn('text-h2', 'text-heading')` returned
 * `text-heading` alone. Every section heading on the public site rendered at
 * body size, and nobody had seen it because each call site also carried an
 * `lg:text-[34px]` arbitrary value — an unambiguous font size, correctly kept —
 * so the headings were right at desktop widths and wrong at every width below
 * 1024px. Measured on the homepage at 1440px after the arbitrary sizes were
 * removed in favour of fluid type: eight `h2` elements at 17px.
 *
 * Naming the scale here is the fix. It is also the only place it CAN be fixed:
 * the tokens live in `@theme`, and tailwind-merge does not read the stylesheet.
 * Anything added to the type scale in globals.css belongs in this list too.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display', 'h1', 'h2', 'h3', 'body', 'small', 'label'] },
      ],
    },
  },
});

/** Merge class names, with later Tailwind utilities winning over earlier ones. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
