'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMedia } from './actions';

/**
 * Delete one photo, with a confirmation that names what is about to go.
 *
 * The confirmation is INLINE rather than a `window.confirm`. A native confirm
 * cannot say which photo it means beyond a string, cannot be styled to match
 * the admin, and on mobile appears at the top of the screen far from the button
 * that opened it. Two clicks in place, with the filename in the question, is
 * clearer.
 *
 * ⚠ THE SENTENCE THAT USED TO END THAT PARAGRAPH WAS WRONG. It claimed this was
 * "the pattern the rest of this admin already uses". When Topic 11 checked, the
 * rest of the admin used `window.confirm` on four pages and asked NOTHING at
 * all on three others. The reasoning above was sound and the claim about the
 * rest of the codebase was not, which is a good argument for not describing
 * code you have not just read.
 *
 * `components/admin/delete-button.tsx` now implements this same two-step
 * pattern for every other destructive action, so the claim is true today - and
 * that file, not this comment, is where the reasoning lives.
 *
 * A photo still attached to a record has no delete button at all. The server
 * refuses that case regardless — the button is hidden because offering an
 * action that will be refused is a worse experience than not offering it.
 */
export function DeleteMediaButton({
  mediaKey,
  name,
  inUse,
}: {
  mediaKey: string;
  name: string;
  inUse: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (inUse) {
    return (
      <span className="text-[13px] text-muted">
        Remove it from those records first
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-11 items-center rounded-sm px-2 text-small font-medium text-muted transition-colors hover:text-danger"
      >
        Delete<span className="sr-only"> {name}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-[13px] text-text">Delete this photo?</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="inline-flex min-h-11 items-center rounded-sm px-2 text-small text-muted hover:text-heading"
        >
          Keep
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            const data = new FormData();
            data.set('key', mediaKey);
            startTransition(async () => {
              const result = await deleteMedia({ status: 'idle' }, data);
              if (result.status === 'deleted') {
                // Re-read the list rather than removing the card locally: the
                // server is the only thing that knows whether it really went.
                router.refresh();
              } else {
                setError(result.message ?? 'That photo could not be removed.');
                setConfirming(false);
              }
            });
          }}
          className="inline-flex min-h-11 items-center rounded-sm bg-danger px-3 text-small font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
