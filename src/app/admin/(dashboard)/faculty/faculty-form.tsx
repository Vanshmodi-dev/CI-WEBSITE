'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { saveFaculty, type FacultyFormState } from './actions';
import { Card, Notice } from '@/components/admin/ui';
import { MediaField } from '@/components/admin/media-field';
import { Field, inputClass, textareaClass } from '@/components/primitives/field';
import { Button } from '@/components/primitives/button';
import { EDIT_TOKEN_FIELD } from '@/lib/stale-edit';

const initial: FacultyFormState = { status: 'idle' };

export type FacultyValues = {
  id?: string;
  name?: string;
  designation?: string;
  subject?: string;
  bio?: string;
  photoUrl?: string;
  priority?: number;
  published?: boolean;
  /** The row's `updatedAt`, for the lost-update guard. Absent when creating. */
  editedAt?: string;
};

/**
 * Add or edit a member of teaching staff.
 *
 * The photograph uses `MediaField` from Topic 5 — the same control the student
 * and story forms use. There is no second uploader here and there must never
 * be one: a second implementation is a second place for the magic-byte check,
 * the size cap and the re-encode to be forgotten.
 *
 * The publish control is worded as the question it actually asks. "Show on the
 * website" is what the teacher is deciding; `published` is what the column is
 * called, and the teacher should never have to learn that.
 */
export function FacultyForm({ values = {} }: { values?: FacultyValues }) {
  const [state, formAction] = useActionState<FacultyFormState, FormData>(
    saveFaculty,
    initial,
  );
  const [photoUrl, setPhotoUrl] = useState(values.photoUrl ?? '');

  /**
   * What a field should show right now.
   *
   * The values the action echoed back after a refusal win over the record's
   * stored values, because React resets the form to `defaultValue` once the
   * action settles - see the note on `FacultyFormState.values`. Without this
   * the reset silently discards whatever the teacher had just typed.
   */
  const shown = (key: string, fallback: string | number | undefined) =>
    state.values?.[key] ?? String(fallback ?? '');
  const editing = Boolean(values.id);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {/* Absent when creating; the action treats a missing token on an EDIT as
          stale, which is what refuses a form that lost track of its version. */}
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
          About this teacher
        </h2>

        <div className="flex flex-col gap-5">
          <Field name="name" label="Name" required error={state.errors?.name}>
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={120}
                defaultValue={shown('name', values.name)}
                className={inputClass(Boolean(state.errors?.name))}
              />
            )}
          </Field>

          <Field
            name="designation"
            label="Role"
            hint='For example "Director" or "Senior Faculty".'
            required
            error={state.errors?.designation}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={120}
                defaultValue={shown('designation', values.designation)}
                className={inputClass(Boolean(state.errors?.designation))}
              />
            )}
          </Field>

          <Field
            name="subject"
            label="Subject"
            hint='For example "Accountancy" or "Economics". Leave blank if it does not apply.'
            error={state.errors?.subject}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={120}
                defaultValue={shown('subject', values.subject)}
                className={inputClass(Boolean(state.errors?.subject))}
              />
            )}
          </Field>

          <Field
            name="bio"
            label="Short description"
            hint="One or two sentences, shown on the card. Up to 600 characters."
            error={state.errors?.bio}
          >
            {(props) => (
              <textarea
                {...props}
                rows={4}
                maxLength={600}
                defaultValue={shown('bio', values.bio)}
                className={textareaClass(Boolean(state.errors?.bio))}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-display text-[18px] font-semibold text-heading">
          Photograph
        </h2>
        {/*
          A REMINDER, NOT A LEGAL CLAIM.

          The project's data policy covers students and says nothing about
          staff, so there is no consent tick box here and inventing one would be
          inventing a policy. What is true and worth saying is that publishing
          somebody's photograph is a decision somebody should have made - so the
          admin says that, in plain words, without asserting what any law
          requires. See docs/PHASE-16-TOPIC-6-FACULTY.md.
        */}
        <p className="measure mb-5 text-small text-muted">
          A photo is optional. Please make sure the person is happy for their
          photograph to appear on the public website before you show it.
        </p>

        <MediaField
          name="photoUrl"
          label="Profile photo"
          hint="Shown on the faculty page. A head-and-shoulders photo works best."
          value={photoUrl}
          error={state.errors?.photoUrl}
          onChange={setPhotoUrl}
        />
      </Card>

      <Card>
        <h2 className="mb-5 font-display text-[18px] font-semibold text-heading">
          Showing on the website
        </h2>

        <div className="flex flex-col gap-5">
          <Field
            name="priority"
            label="Order"
            hint="Higher numbers appear first. Leave at 0 unless you want someone at the top."
            error={state.errors?.priority}
          >
            {(props) => (
              <input
                {...props}
                type="number"
                min={0}
                max={1000}
                step={1}
                defaultValue={shown('priority', values.priority ?? 0)}
                className={inputClass(Boolean(state.errors?.priority))}
              />
            )}
          </Field>

          <div className="flex items-start gap-3">
            <input
              id="f-published"
              name="published"
              type="checkbox"
              defaultChecked={
                state.values ? state.values.published === 'on' : (values.published ?? false)
              }
              className="mt-1 h-5 w-5 shrink-0 rounded-sm border-rule-strong accent-navy-800"
            />
            <label htmlFor="f-published" className="text-small text-text">
              Show this teacher on the website
              <span className="mt-0.5 block text-[13px] text-muted">
                Leave this unticked to keep working on the entry. Nothing appears
                publicly until it is ticked.
              </span>
            </label>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-4">
        <SaveButton editing={editing} />
        <Link
          href="/admin/faculty"
          className="inline-flex min-h-11 items-center text-small font-medium text-muted hover:text-heading"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

function SaveButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : editing ? 'Save changes' : 'Add teacher'}
    </Button>
  );
}
