'use client';

import { useActionState, useState } from 'react';
import { EDIT_TOKEN_FIELD } from '@/lib/stale-edit';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { saveStory, type StoryFormState } from './actions';
import { Card, Notice } from '@/components/admin/ui';
import { Field, inputClass, selectClass, textareaClass } from '@/components/primitives/field';
import { Button } from '@/components/primitives/button';
import { blockersForPublishing, type DisplayNameModeValue } from '@/lib/student-display';
import { PROGRAMME_LABELS, DISPLAY_NAME_LABELS } from '@/lib/admin-format';

const initial: StoryFormState = { status: 'idle' };

export type StoryValues = {
  id?: string;
  /** The record's `updatedAt` when this form was rendered. Lost-update guard. */
  editedAt?: string;
  studentName?: string;
  displayNameMode?: DisplayNameModeValue;
  photoUrl?: string;
  programme?: string;
  year?: string;
  challenge?: string;
  journey?: string;
  outcome?: string;
  quote?: string;
  consentRef?: string;
  consentStory?: boolean;
  consentName?: boolean;
  consentPhoto?: boolean;
  published?: boolean;
};

export function StoryForm({ values = {} }: { values?: StoryValues }) {
  const [state, formAction] = useActionState<StoryFormState, FormData>(
    saveStory,
    initial,
  );
  const editing = Boolean(values.id);

  const [studentName, setStudentName] = useState(values.studentName ?? '');
  const [displayNameMode, setDisplayNameMode] = useState<DisplayNameModeValue>(
    values.displayNameMode ?? 'INITIALS',
  );
  const [photoUrl, setPhotoUrl] = useState(values.photoUrl ?? '');
  const [consentRef, setConsentRef] = useState(values.consentRef ?? '');
  const [consentStory, setConsentStory] = useState(values.consentStory ?? false);
  const [consentName, setConsentName] = useState(values.consentName ?? false);
  const [consentPhoto, setConsentPhoto] = useState(values.consentPhoto ?? false);
  const [published, setPublished] = useState(values.published ?? false);

  const blockers = blockersForPublishing(
    {
      studentName: studentName || 'Student',
      displayNameMode,
      photoUrl: photoUrl || null,
      consentRef: consentRef || null,
      consentStory,
      consentName,
      consentPhoto,
      published: true,
    },
    'consentStory',
  );
  const canPublish = blockers.length === 0;

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {/* Refuses the save if the story moved while this form was open. */}
      {values.id ? (
        <input type="hidden" name={EDIT_TOKEN_FIELD} value={values.editedAt ?? ''} />
      ) : null}

      {state.status === 'error' && state.message ? (
        <Notice tone="danger" title={state.message}>
          {state.blockers && state.blockers.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {state.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            'Please check the form and try again.'
          )}
        </Notice>
      ) : null}

      <Card>
        <h2 className="mb-5 font-display text-[18px] font-semibold text-heading">
          Student
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field name="studentName" label="Full name" required error={state.errors?.studentName}>
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={120}
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className={inputClass(Boolean(state.errors?.studentName))}
              />
            )}
          </Field>
          <Field name="programme" label="Course" required error={state.errors?.programme}>
            {(props) => (
              <select
                {...props}
                defaultValue={values.programme ?? ''}
                className={selectClass(Boolean(state.errors?.programme))}
              >
                <option value="">Please choose…</option>
                {Object.entries(PROGRAMME_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field name="year" label="Year" required error={state.errors?.year}>
            {(props) => (
              <input
                {...props}
                type="number"
                min={2000}
                max={2100}
                defaultValue={values.year ?? ''}
                className={inputClass(Boolean(state.errors?.year))}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-5 font-display text-[18px] font-semibold text-heading">
          Their story
        </h2>
        <div className="flex flex-col gap-5">
          <Field
            name="challenge"
            label="What did they find hard?"
            required
            error={state.errors?.challenge}
          >
            {(props) => (
              <textarea
                {...props}
                rows={3}
                maxLength={2000}
                defaultValue={values.challenge ?? ''}
                className={textareaClass(Boolean(state.errors?.challenge))}
              />
            )}
          </Field>
          <Field
            name="journey"
            label="How did they work on it?"
            required
            error={state.errors?.journey}
          >
            {(props) => (
              <textarea
                {...props}
                rows={5}
                maxLength={4000}
                defaultValue={values.journey ?? ''}
                className={textareaClass(Boolean(state.errors?.journey))}
              />
            )}
          </Field>
          <Field
            name="outcome"
            label="How did it turn out?"
            required
            error={state.errors?.outcome}
          >
            {(props) => (
              <textarea
                {...props}
                rows={3}
                maxLength={2000}
                defaultValue={values.outcome ?? ''}
                className={textareaClass(Boolean(state.errors?.outcome))}
              />
            )}
          </Field>
          <Field name="quote" label="Something in their own words" hint="Optional.">
            {(props) => (
              <textarea
                {...props}
                rows={2}
                maxLength={600}
                defaultValue={values.quote ?? ''}
                className={textareaClass(false)}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-[18px] font-semibold text-heading">
          Permissions
        </h2>
        <p className="mt-1 max-w-prose text-[13px] text-muted">
          Publishing a story is its own permission. Agreeing to a story does not
          agree to a photograph, and agreeing to a result does not agree to a
          story.
        </p>

        <div className="mt-5">
          <Field
            name="consentRef"
            label="Consent form reference"
            hint="How you can find the signed form later."
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={200}
                value={consentRef}
                onChange={(e) => setConsentRef(e.target.value)}
                className={inputClass(false)}
              />
            )}
          </Field>
        </div>

        <fieldset className="mt-5">
          <legend className="text-small font-medium text-text">
            What may we show?
          </legend>
          <div className="mt-3 flex flex-col gap-3">
            <Permission
              name="consentStory"
              checked={consentStory}
              onChange={setConsentStory}
              label="Story"
              hint="Their story may be published on the website."
            />
            <Permission
              name="consentName"
              checked={consentName}
              onChange={setConsentName}
              label="Name"
              hint="Their name may be shown instead of just initials."
            />
            <Permission
              name="consentPhoto"
              checked={consentPhoto}
              onChange={setConsentPhoto}
              label="Photograph"
              hint="Their photo may be shown. Always a separate permission."
            />
          </div>
        </fieldset>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field name="displayNameMode" label="How should their name appear?">
            {(props) => (
              <select
                {...props}
                value={displayNameMode}
                onChange={(e) =>
                  setDisplayNameMode(e.target.value as DisplayNameModeValue)
                }
                className={selectClass(false)}
              >
                {Object.entries(DISPLAY_NAME_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field name="photoUrl" label="Photo" hint="Optional.">
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={500}
                placeholder="/photos/example.jpg"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                className={inputClass(false)}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-[18px] font-semibold text-heading">
          Show on website
        </h2>

        {!canPublish ? (
          <div className="mt-4 rounded-sm border border-warn/40 bg-warn-bg px-4 py-3 text-small">
            <p className="font-medium">
              More permission is needed before this can be shown.
            </p>
            <ul className="mt-2 list-disc pl-5">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="mt-4 flex items-start gap-3 text-small text-text">
          <input
            type="checkbox"
            name="published"
            checked={published && canPublish}
            disabled={!canPublish}
            onChange={(e) => setPublished(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded-[3px] border-rule-strong accent-navy-800 disabled:opacity-40"
          />
          <span>
            <span className="font-medium">Show this story on the website</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              New stories stay private until you tick this.
            </span>
          </span>
        </label>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton editing={editing} />
        <Link href="/admin/stories" className="text-small text-link">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Permission({
  name,
  checked,
  onChange,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex items-start gap-3 text-small text-text">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded-[3px] border-rule-strong accent-navy-800"
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{hint}</span>
      </span>
    </label>
  );
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Saving…' : editing ? 'Save changes' : 'Add story'}
    </Button>
  );
}
