'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { saveStudentResult, type StudentFormState } from './actions';
import { Card, Notice } from '@/components/admin/ui';
import { MediaField } from '@/components/admin/media-field';
import { Field, inputClass, selectClass } from '@/components/primitives/field';
import { EDIT_TOKEN_FIELD } from '@/lib/stale-edit';
import { Button } from '@/components/primitives/button';
import {
  blockersForPublishing,
  present,
  type DisplayNameModeValue,
} from '@/lib/student-display';
import { PROGRAMME_LABELS, BOARD_LABELS, DISPLAY_NAME_LABELS } from '@/lib/admin-format';
import { SubjectScores, type SubjectRow } from '@/components/admin/subject-scores';

const initial: StudentFormState = { status: 'idle' };

export type StudentValues = {
  id?: string;
  /** The record's `updatedAt` when this form was rendered. Lost-update guard. */
  editedAt?: string;
  studentName?: string;
  displayNameMode?: DisplayNameModeValue;
  photoUrl?: string;
  score?: string;
  scoreUnit?: string;
  programme?: string;
  board?: string;
  year?: string;
  highlight?: string;
  consentRef?: string;
  consentResult?: boolean;
  consentName?: boolean;
  consentPhoto?: boolean;
  published?: boolean;
  subjects?: SubjectRow[];
};

/**
 * Add or edit a student result.
 *
 * THE POINT OF THIS SCREEN is the permissions panel. Consent is four separate
 * questions, because that is how a parent grants it on a form — ticking
 * "Story" must never quietly also publish a photograph.
 *
 * The live preview underneath shows exactly what a visitor would see, so the
 * teacher can check before publishing rather than after.
 */
export function StudentForm({ values = {} }: { values?: StudentValues }) {
  const [state, formAction] = useActionState<StudentFormState, FormData>(
    saveStudentResult,
    initial,
  );
  const editing = Boolean(values.id);

  // Mirrored locally so the preview and the publish gate react as you type.
  const [studentName, setStudentName] = useState(values.studentName ?? '');
  const [displayNameMode, setDisplayNameMode] = useState<DisplayNameModeValue>(
    values.displayNameMode ?? 'INITIALS',
  );
  const [photoUrl, setPhotoUrl] = useState(values.photoUrl ?? '');
  const [consentRef, setConsentRef] = useState(values.consentRef ?? '');
  const [consentResult, setConsentResult] = useState(values.consentResult ?? false);
  const [consentName, setConsentName] = useState(values.consentName ?? false);
  const [consentPhoto, setConsentPhoto] = useState(values.consentPhoto ?? false);
  const [published, setPublished] = useState(values.published ?? false);

  const draft = {
    studentName: studentName || 'Student',
    displayNameMode,
    photoUrl: photoUrl || null,
    consentRef: consentRef || null,
    consentResult,
    consentName,
    consentPhoto,
    published: true,
  };

  const blockers = blockersForPublishing(draft);
  const preview = present(draft);
  const canPublish = blockers.length === 0;

  return (
    <form action={formAction} className="flex max-w-3xl flex-col gap-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {/* Carries the row's updatedAt back to the action, which refuses the save
          if the record moved while this form was open. Without it a tab opened
          before a consent withdrawal would write the old permissions back. */}
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

      {/* ---------------------------------------------------- the student -- */}
      <Card>
        <h2 className="mb-5 font-display text-[18px] font-semibold text-heading">
          Student
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
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

          <Field name="board" label="Board">
            {(props) => (
              <select
                {...props}
                defaultValue={values.board ?? ''}
                className={selectClass(false)}
              >
                <option value="">Not applicable</option>
                {Object.entries(BOARD_LABELS).map(([v, label]) => (
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

      {/* ------------------------------------------------------- result ---- */}
      <Card>
        <h2 className="mb-5 font-display text-[18px] font-semibold text-heading">
          Result
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field name="score" label="Result" required error={state.errors?.score}>
            {(props) => (
              <input
                {...props}
                type="number"
                step="0.01"
                min={0}
                defaultValue={values.score ?? ''}
                className={inputClass(Boolean(state.errors?.score))}
              />
            )}
          </Field>

          <Field name="scoreUnit" label="Is that a percentage or marks?">
            {(props) => (
              <select
                {...props}
                defaultValue={values.scoreUnit ?? 'percent'}
                className={selectClass(false)}
              >
                <option value="percent">Percentage</option>
                <option value="marks">Marks</option>
              </select>
            )}
          </Field>
        </div>

        <div className="mt-6 border-t border-rule pt-6">
          <SubjectScores initial={values.subjects ?? []} />
        </div>

        <div className="mt-6">
          <Field
            name="highlight"
            label="Achievement note"
            hint='Optional. For example "School topper".'
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={160}
                defaultValue={values.highlight ?? ''}
                className={inputClass(false)}
              />
            )}
          </Field>
        </div>
      </Card>

      {/* --------------------------------------------------- permissions --- */}
      <Card>
        <h2 className="font-display text-[18px] font-semibold text-heading">
          Permissions
        </h2>
        <p className="mt-1 max-w-prose text-[13px] text-muted">
          Only tick what the student or their parent has actually agreed to in
          writing. Each permission is separate — agreeing to one does not agree
          to the others.
        </p>

        <div className="mt-5">
          <Field
            name="consentRef"
            label="Consent form reference"
            hint="How you can find the signed form later, for example a file number."
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
              name="consentResult"
              checked={consentResult}
              onChange={setConsentResult}
              label="Result"
              hint="Their score may appear on the website."
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
              hint="Their photo may be shown. This is always a separate permission."
            />
          </div>
        </fieldset>

        <div className="mt-5">
          <Field
            name="displayNameMode"
            label="How should their name appear?"
          >
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
        </div>

        <div className="mt-5">
          {/*
            Was a text box the teacher typed `/photos/example.jpg` into, having
            first sent the file to a developer to put it there. Phase 16.

            The live preview below still reads `photoUrl`, so it keeps showing
            what a visitor would see the moment a photo is chosen - including
            showing NOTHING while photo consent is unticked.
          */}
          <MediaField
            name="photoUrl"
            label="Photo"
            hint="Shown only if you tick the photograph permission below."
            value={photoUrl}
            error={state.errors?.photoUrl}
            onChange={setPhotoUrl}
          />
        </div>
      </Card>

      {/* ------------------------------------------------------ preview ---- */}
      <Card>
        <h2 className="font-display text-[18px] font-semibold text-heading">
          What visitors will see
        </h2>
        <div className="mt-4 flex items-center gap-4 rounded-md border border-rule bg-surface p-4">
          {preview.photoUrl ? (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-100 text-[13px] text-navy-800">
              photo
            </span>
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-800 font-display text-[18px] font-bold text-white">
              {preview.monogram}
            </span>
          )}
          <div>
            <p className="font-medium text-text">
              {preview.name ?? (
                <span className="text-muted">No name shown</span>
              )}
            </p>
            <p className="text-[13px] text-muted">
              {preview.photoUrl ? 'Photo shown' : 'No photo shown'}
            </p>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------ publish ---- */}
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
            <span className="font-medium">Show this result on the website</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              New records stay private until you tick this.
            </span>
          </span>
        </label>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton editing={editing} />
        <Link href="/admin/students" className="text-small text-link">
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
      {pending ? 'Saving…' : editing ? 'Save changes' : 'Add result'}
    </Button>
  );
}
