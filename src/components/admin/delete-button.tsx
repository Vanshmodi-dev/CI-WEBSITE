'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * The ONE destructive control in this admin.
 *
 * =============================================================================
 * WHAT PHASE 16 TOPIC 11 FOUND
 * =============================================================================
 * There were THREE different answers to "what happens when I click Delete?",
 * decided by which phase happened to build the page:
 *
 *   announcements, batches, stories, results   a native `window.confirm`
 *   photos (the media library)                 a two-step inline confirm
 *   faculty, gallery, videos                   NOTHING - one click and gone
 *
 * The third one is the reason this file was rewritten rather than tidied. It
 * was measured in a real browser: click "Remove" on a teacher, no dialog of any
 * kind appears, and `prisma.faculty.delete` has already run. The control sits
 * in a card next to "Edit", it is a normal-looking button, and on a phone it is
 * a thumb's width from the link you actually wanted. Faculty, gallery and video
 * records are all hard deletes with no undo.
 *
 * That was not a decision anybody made. Topics 6, 8 and 9 each built a card
 * list, each wrote the remove control inline, and none of them reached for the
 * shared component - which four older pages were already using.
 *
 * =============================================================================
 * WHY INLINE AND NOT `window.confirm`
 * =============================================================================
 * The media library had already argued this in a comment, and its reasoning was
 * right: a native confirm cannot name what it is about to delete beyond a bare
 * string, cannot be styled, and on a phone appears at the top of the screen far
 * from the button that opened it.
 *
 * The same comment then claimed this was "the pattern the rest of this admin
 * already uses". It was not - the rest of the admin used `window.confirm`, and
 * three pages used nothing. The claim is corrected here by making it true.
 *
 * =============================================================================
 * WITHOUT JAVASCRIPT
 * =============================================================================
 * The first control is a REAL submit button, and the interception happens in an
 * onClick. With no JavaScript that handler never runs and the form posts
 * straight through - exactly what the previous `window.confirm` version did,
 * so nothing regresses for a browser without JS. The server authorises the
 * request either way; the confirmation is protection against a slip, not a
 * security boundary.
 */
export function DeleteButton({
  confirmMessage,
  label = 'Delete',
  /** Named in the confirmation and in the button's accessible name. */
  name,
}: {
  confirmMessage: string;
  label?: string;
  name?: string;
}) {
  const [asking, setAsking] = useState(false);
  const { pending } = useFormStatus();

  if (!asking) {
    return (
      <button
        type="submit"
        onClick={(event) => {
          event.preventDefault();
          setAsking(true);
        }}
        className="inline-flex min-h-11 items-center rounded-sm border border-danger/50 px-4 text-small font-medium text-danger transition-colors hover:bg-danger-bg"
      >
        {label}
        {name ? <span className="sr-only"> {name}</span> : null}
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {/*
        `role="alert"` so the question is announced when it replaces the
        button, rather than silently swapping one control for another.
      */}
      <span role="alert" className="text-[13px] text-text">
        {confirmMessage}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => setAsking(false)}
        className="inline-flex min-h-11 items-center rounded-sm px-3 text-small text-muted transition-colors hover:text-heading"
      >
        Keep
      </button>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center rounded-sm bg-danger px-4 text-small font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? 'Deleting…' : label}
      </button>
    </span>
  );
}
