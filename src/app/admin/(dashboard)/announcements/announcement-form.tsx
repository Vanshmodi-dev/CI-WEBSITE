'use client';

import { useActionState } from 'react';
import { saveAnnouncement, type AnnouncementFormState } from './actions';
import { Card, Notice } from '@/components/admin/ui';
import { Field, inputClass, textareaClass } from '@/components/primitives/field';
import { EDIT_TOKEN_FIELD } from '@/lib/stale-edit';
import { Checkbox } from '@/components/primitives/checkbox';
import { FormActions } from '@/components/admin/form-actions';

const initial: AnnouncementFormState = { status: 'idle' };

export type AnnouncementValues = {
  /** The row's `updatedAt`, for the lost-update guard. Absent when creating. */
  editedAt?: string;
  id?: string;
  message?: string;
  href?: string;
  startsAt?: string;
  endsAt?: string;
  published?: boolean;
};

/**
 * Add or edit an announcement.
 *
 * The end date is REQUIRED, not optional. This is the single feature that
 * prevents the failure the old website shipped with: a banner announcing a
 * batch that had already started two months earlier. An announcement that
 * cannot expire will eventually lie.
 */
export function AnnouncementForm({
  values = {},
}: {
  values?: AnnouncementValues;
}) {
  const [state, formAction] = useActionState<AnnouncementFormState, FormData>(
    saveAnnouncement,
    initial,
  );
  const editing = Boolean(values.id);

  /**
   * What a field should show right now.
   *
   * Values echoed back by a refused save win over the record's stored values,
   * because React resets the form to `defaultValue` once the action settles.
   */
  const shown = (key: string, fallback: string | number | undefined) =>
    state.values?.[key] ?? String(fallback ?? '');

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {/* Absent when creating; the action treats a missing token on an EDIT
          as stale, which is what refuses a form that lost track of its
          version. */}
      <input type="hidden" name={EDIT_TOKEN_FIELD} value={values.editedAt ?? ''} />

      {/*
        ⚠ THIS SLOT IS ALWAYS RENDERED, AND THAT IS THE FIX.

        It used to be `{error ? <Notice/> : null}`. Inserting a new element here
        on a validation failure shifted every following sibling by one index,
        and React reconciles children by position - so the Cards below were
        unmounted and remounted, and every uncontrolled input in them reset to
        its `defaultValue`.

        The visible effect was that a teacher who filled in a long form and
        missed one required field lost EVERYTHING they had typed, on a page that
        was politely telling them to check the highlighted fields. Measured in
        Topic 11: no navigation occurred, so this was the React path, not a full
        page reload.

        Keeping the wrapper mounted keeps every sibling at a stable index.
        `aria-live` is the second half: the message is now announced rather than
        only coloured.
      */}
      <div aria-live="polite">
        {state.status === 'error' && state.message ? (
          <Notice tone="danger">{state.message}</Notice>
        ) : null}
      </div>

      <Card>
        <h2 className="mb-5 font-display text-[18px] font-semibold text-heading">
          What do you want to say?
        </h2>

        <div className="flex flex-col gap-5">
          <Field
            name="message"
            label="Message"
            required
            hint="Keep it to one short sentence. It shows as a strip across the top of the website."
            error={state.errors?.message}
          >
            {(props) => (
              <textarea
                {...props}
                rows={3}
                maxLength={300}
                defaultValue={shown('message', values.message)}
                className={textareaClass(Boolean(state.errors?.message))}
              />
            )}
          </Field>

          <Field
            name="href"
            label="Where should it link to?"
            hint="Optional. A page on this website, for example /admissions"
            error={state.errors?.href}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={300}
                placeholder="/admissions"
                defaultValue={shown('href', values.href)}
                className={inputClass(Boolean(state.errors?.href))}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-[18px] font-semibold text-heading">
          When should it show?
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          It disappears by itself after the end date, so an old notice can never
          stay up by mistake.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            name="startsAt"
            label="Start showing"
            required
            error={state.errors?.startsAt}
          >
            {(props) => (
              <input
                {...props}
                type="date"
                defaultValue={shown('startsAt', values.startsAt)}
                className={inputClass(Boolean(state.errors?.startsAt))}
              />
            )}
          </Field>

          <Field
            name="endsAt"
            label="Stop showing"
            required
            error={state.errors?.endsAt}
          >
            {(props) => (
              <input
                {...props}
                type="date"
                defaultValue={shown('endsAt', values.endsAt)}
                className={inputClass(Boolean(state.errors?.endsAt))}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-[18px] font-semibold text-heading">
          Visibility
        </h2>
        <Checkbox
          className="mt-4"
          name="published"
          defaultChecked={
            state.values ? state.values.published === 'on' : (values.published ?? false)
          }
          label="Show this on the website"
          description="Leave unticked to save it as a draft and publish later."
        />
      </Card>

      <FormActions
        cancelHref="/admin/announcements"
        createLabel="Add announcement"
        editing={editing}
      />
    </form>
  );
}

