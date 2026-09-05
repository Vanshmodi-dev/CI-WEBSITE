'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { refreshProviderUsage } from './actions';
import { initialRefreshState, type RefreshState } from './state';

/**
 * Ask Cloudinary again, on demand.
 *
 * Provider figures are cached for ten minutes because the Admin API is rate
 * limited and shares its budget with uploads. This is the escape hatch for an
 * administrator who has just deleted a batch of photographs and wants to see
 * the number move.
 *
 * ⚠ THE DISABLED STATE IS A COURTESY, NOT A CONTROL. It stops a double-click;
 * it does not stop anything. The real bound is `REFRESH_WINDOW` in actions.ts,
 * server-side, keyed to the administrator — because a button's `disabled`
 * attribute is a suggestion to a browser and nothing more.
 *
 * The result is announced through `role="status"`, so somebody using a screen
 * reader hears that the refresh finished rather than having to go looking for a
 * number that may not have changed.
 */
export function RefreshUsageButton() {
  const [state, setState] = useState<RefreshState>(initialRefreshState);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setState(initialRefreshState);
          startTransition(async () => {
            const next = await refreshProviderUsage();
            setState(next);
            // Re-read the server component so the new figures actually appear.
            if (next.status === 'done') router.refresh();
          });
        }}
        className="inline-flex min-h-11 items-center rounded-sm border border-rule-strong bg-paper px-4 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-navy-600"
      >
        {pending ? 'Checking…' : 'Refresh usage'}
      </button>

      {/*
        Always present in the tree, so assistive technology has something to
        watch. Rendering it conditionally means the live region does not exist
        at the moment the message arrives, and the announcement is lost.
      */}
      <p
        role="status"
        aria-live="polite"
        className={
          state.status === 'error'
            ? 'text-[13px] font-medium text-danger'
            : 'text-[13px] text-muted'
        }
      >
        {state.status === 'idle' ? '' : state.message}
      </p>
    </div>
  );
}
