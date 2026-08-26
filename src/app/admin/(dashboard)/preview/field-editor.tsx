'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { saveWebsiteContent, type WebsiteFormState } from '../website/actions';
import { Button } from '@/components/primitives/button';
import { inputClass, textareaClass } from '@/components/primitives/field';
import { EDIT_TOKEN_FIELD } from '@/lib/stale-edit';
import type { FieldView } from '@/config/site-content';

const initial: WebsiteFormState = { status: 'idle' };

/**
 * Click-to-edit for ONE registered CMS field.
 *
 * =============================================================================
 * WHY THIS IS A LIST OF DECLARED FIELDS AND NOT AN OVERLAY ON THE LIVE SITE
 * =============================================================================
 * The obvious build is an iframe of the real website with edit handles floating
 * over it. That is not available here, and the reason is a security property
 * this phase is not allowed to weaken: `next.config.ts` sends
 * `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Framing our own site
 * would mean relaxing both, sitewide, so that an admin screen could look
 * prettier. Clickjacking protection is worth more than that.
 *
 * The alternative failure would be worse still: re-implementing the public
 * pages inside the admin so they can be annotated. That is the "second
 * rendering implementation that can drift" the brief warns about, and drift
 * here is not cosmetic - it would tell a teacher their edit appears somewhere
 * it does not.
 *
 * So the preview shows the SAME VALUES the public site is rendering, read
 * through the same `getSiteContent()` the public pages call, arranged by the
 * page and section each field declares. The declaration is not a comment: a
 * unit test asserts every key is genuinely read by the source file serving that
 * route, so the map cannot quietly go stale. Each page links out to itself so
 * the teacher can see the real thing in its real layout.
 *
 * =============================================================================
 * WHAT CANNOT BE EDITED HERE
 * =============================================================================
 * Only fields the server rendered from the registry appear at all. There is no
 * "make this editable" affordance, no contenteditable, and no path by which a
 * DOM node becomes a CMS key. The action re-validates the key against the
 * registry anyway, because a browser can post whatever it likes.
 */
export function FieldEditor({
  field,
  value,
  token,
}: {
  field: FieldView;
  /** What the public site is showing for this field right now. */
  value: string;
  /** Latest updatedAt across this field's row, for the lost-update guard. */
  token: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, formAction] = useActionState<WebsiteFormState, FormData>(
    saveWebsiteContent,
    initial,
  );

  /**
   * Open state is DERIVED, not set from an effect.
   *
   * The obvious version calls `setOpen(false)` inside an effect watching for a
   * successful save. React's own lint rule rejects that, and it is right to:
   * a state update scheduled from an effect runs after paint, so the dialog
   * would briefly render its success state before vanishing, and any second
   * render caused by something else would fight it.
   *
   * Instead the dialog records WHICH action-state it was opened against, and is
   * open only while that still matches. A successful save replaces the state
   * object, the comparison fails, and the dialog closes during render with no
   * effect involved. This is the same trick the mobile drawer in
   * `site-header.tsx` uses against the pathname, for the same reason.
   */
  const [openedAgainst, setOpenedAgainst] = useState<WebsiteFormState | null>(null);
  const open = openedAgainst !== null && (state === openedAgainst || state.status === 'error');
  const titleId = useId();
  const inputId = useId();

  /**
   * `showModal()` rather than the `open` attribute.
   *
   * Only the modal method gives the dialog the top layer, the backdrop, the
   * inert background and the Escape handling. Setting `open` renders a
   * non-modal dialog that looks identical and leaves the page behind it fully
   * focusable - the same class of defect Phase 11 found in the mobile drawer,
   * where `aria-modal` was present but focus walked straight out of it.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /**
   * A save that succeeded re-reads the live values behind the dialog.
   *
   * This effect performs no state update - `router.refresh()` is a navigation,
   * and the dialog has already closed by derivation above.
   */
  useEffect(() => {
    if (state.status === 'saved') router.refresh();
  }, [state.status, router]);

  const error = state.errors?.[field.key];
  const shown = value.trim() === '' ? null : value;
  const isDefault = value.trim() === field.fallback.trim();

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-muted">{field.label}</p>
          {/*
            Rendered as TEXT. Whatever a previous administrator typed is a
            string here, escaped by React, exactly as it is on the public page.
          */}
          {shown ? (
            <p className="mt-0.5 whitespace-pre-line break-words text-small text-text">
              {shown}
            </p>
          ) : (
            <p className="mt-0.5 text-small italic text-muted">
              Blank — nothing is shown on the website.
            </p>
          )}
          {isDefault ? (
            <p className="mt-1 text-[12px] text-muted">Original wording</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setOpenedAgainst(state)}
          className="inline-flex min-h-11 shrink-0 items-center rounded-sm border border-rule px-3 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected"
        >
          Edit<span className="sr-only"> {field.label}</span>
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpenedAgainst(null)}
        /* Clicking the backdrop closes. The check is on the dialog element
           itself: a click that lands on the backdrop reports the dialog as its
           target, because the backdrop is not a node of its own. */
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpenedAgainst(null);
        }}
        className="w-[min(92vw,560px)] rounded-lg border border-rule bg-paper p-0 text-text shadow-e3 backdrop:bg-navy-950/50"
      >
        <form action={formAction} className="flex flex-col gap-5 p-6">
          <input type="hidden" name="group" value={field.group} />
          <input type="hidden" name="only" value={field.key} />
          <input type="hidden" name={EDIT_TOKEN_FIELD} value={token} />

          <div>
            <h2 id={titleId} className="font-display text-[19px] font-semibold text-heading">
              {field.label}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              Appears on {field.renders.route === '*' ? 'every page' : field.renders.route}
              {' · '}
              {field.renders.section}
            </p>
          </div>

          {state.status === 'error' && state.message ? (
            <p role="alert" className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-small">
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className="text-small font-medium text-text">
              {field.blankable ? 'Text (may be left blank)' : 'Text'}
            </label>
            {field.help ? (
              <p className="text-[13px] text-muted">{field.help}</p>
            ) : null}

            {field.kind === 'line' ? (
              <input
                id={inputId}
                name={field.key}
                type="text"
                defaultValue={value}
                maxLength={field.maxLength}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                className={inputClass(Boolean(error))}
              />
            ) : (
              <textarea
                id={inputId}
                name={field.key}
                rows={field.kind === 'lines' ? 5 : 4}
                defaultValue={value}
                maxLength={field.maxLength}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                className={textareaClass(Boolean(error))}
              />
            )}

            {error ? (
              <p id={`${inputId}-error`} className="text-[13px] font-medium text-danger">
                {error}
              </p>
            ) : null}

            <p className="text-[12px] text-muted">
              Up to {field.maxLength} characters.
              {field.blankable
                ? ' Leave blank to show nothing.'
                : ' Clear it to put the original wording back.'}
            </p>
          </div>

          {field.fallback.trim() !== '' ? (
            <div className="rounded-md border border-rule bg-surface p-3">
              <p className="text-[12px] font-medium text-muted">Original wording</p>
              <p className="mt-1 whitespace-pre-line text-[13px] text-text">
                {field.fallback}
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-rule pt-4">
            <button
              type="button"
              onClick={() => setOpenedAgainst(null)}
              className="inline-flex min-h-11 items-center rounded-sm px-3 text-small font-medium text-muted hover:text-heading"
            >
              Cancel
            </button>
            <SaveButton />
          </div>
        </form>
      </dialog>
    </>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}
