'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/primitives/button';

/**
 * Save and Cancel — the same pair, the same way, on every admin form.
 *
 * =============================================================================
 * WHAT THIS REPLACED
 * =============================================================================
 * Nine near-identical components under two names (`SaveButton` on the pages
 * Topics 6/8/9 built, `SubmitButton` on the four older ones), and two different
 * Cancel controls:
 *
 *   older forms   <Link className="text-small text-link">      23px tall, blue
 *   newer forms   <Link className="inline-flex min-h-11 …">    44px tall, muted
 *
 * with the Save buttons on `size="lg"` in one group and the default size in the
 * other. So the same two controls, doing the same two things, changed shape
 * depending on which page you happened to be on — and the older Cancel measured
 * 43x23, under the 24x24 floor this project asserts on its public pages.
 *
 * The muted Cancel is the one kept. Cancel and Save are not equals: painting
 * Cancel in link-blue next to a navy Save gives the destructive-to-your-work
 * option the same visual weight as the one you almost always want.
 */
export function FormActions({
  /** Where Cancel goes back to. */
  cancelHref,
  /** "Add teacher" / "Add photograph" — what the button says when creating. */
  createLabel,
  editing,
}: {
  cancelHref: string;
  createLabel: string;
  editing: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : editing ? 'Save changes' : createLabel}
      </Button>
      <Link
        href={cancelHref}
        className="inline-flex min-h-11 items-center rounded-sm px-1 text-small font-medium text-muted transition-colors hover:text-heading"
      >
        Cancel
      </Link>
    </div>
  );
}
