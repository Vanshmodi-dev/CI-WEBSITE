'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { refreshReviews, type ReviewRefreshState } from './actions';
import { Notice } from '@/components/admin/ui';
import { Button } from '@/components/primitives/button';

const initial: ReviewRefreshState = { status: 'idle' };

/** Clears the cached payload. It cannot change a review. */
export function RefreshReviewsButton() {
  const [state, formAction] = useActionState<ReviewRefreshState, FormData>(
    refreshReviews,
    initial,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.status === 'refreshed' && state.message ? (
        <Notice tone="ok">{state.message}</Notice>
      ) : null}
      {state.status === 'error' && state.message ? (
        <Notice tone="danger">{state.message}</Notice>
      ) : null}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Checking…' : 'Check for new reviews'}
    </Button>
  );
}
