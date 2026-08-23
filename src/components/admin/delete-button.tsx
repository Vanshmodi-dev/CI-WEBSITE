'use client';

import { useFormStatus } from 'react-dom';

/**
 * Destructive action with a confirmation step.
 *
 * Confirmation is required for deletes and deliberately NOT for ordinary
 * saves — a dialog on every save trains people to dismiss dialogs without
 * reading them, which is exactly when a real warning gets missed.
 *
 * Without JavaScript the confirm never fires and the form submits directly.
 * That is acceptable: the server still authorises the request, and the button
 * is unambiguously labelled.
 */
export function DeleteButton({
  confirmMessage,
  label = 'Delete',
}: {
  confirmMessage: string;
  label?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
      className="inline-flex min-h-11 items-center rounded-sm border border-danger/50 px-4 text-small font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
    >
      {pending ? 'Deleting…' : label}
    </button>
  );
}
