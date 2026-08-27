'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import { saveVideo, type VideoFormState } from './actions';
import { Card, Notice } from '@/components/admin/ui';
import { Field, inputClass, selectClass, textareaClass } from '@/components/primitives/field';
import { Button } from '@/components/primitives/button';
import { EDIT_TOKEN_FIELD } from '@/lib/stale-edit';
import {
  parseYouTubeId,
  thumbnailUrl,
  watchUrl,
  VIDEO_SUBJECTS,
  SUBJECT_LABEL,
  type VideoSubjectValue,
} from '@/lib/video';

const initial: VideoFormState = { status: 'idle' };

export type VideoValues = {
  id?: string;
  youtubeUrl?: string;
  title?: string;
  description?: string;
  subject?: VideoSubjectValue;
  priority?: number;
  published?: boolean;
  /** The row's `updatedAt`, for the lost-update guard. Absent when creating. */
  editedAt?: string;
};

/**
 * Add or edit a video.
 *
 * =============================================================================
 * THE FIELD ASKS FOR A LINK, NOT AN EMBED CODE
 * =============================================================================
 * The label says "YouTube video link" and the hint shows the two shapes people
 * actually have in their clipboard. It does not say "embed code", and there is
 * nowhere to paste one — a teacher who pastes `<iframe …>` is told what is
 * expected instead of having their HTML stored.
 *
 * That wording is a security control as much as a usability one. A field
 * labelled "embed code" invites exactly the input this application refuses.
 *
 * =============================================================================
 * THE PREVIEW IS BUILT FROM THE PARSED ID, IN THE BROWSER, BY THE SAME PARSER
 * =============================================================================
 * `parseYouTubeId` is imported here and called again on the server. It is
 * deliberately not re-implemented for the browser: a second copy of a
 * validation rule is a second answer waiting to disagree, and the one that
 * disagrees quietly is the one that stores something it should not have.
 *
 * This copy is a CONVENIENCE — it shows the teacher which video they just
 * pasted, before saving, so a wrong link is caught by eye. The server copy
 * decides, and a database CHECK constraint decides again after that.
 */
export function VideoForm({ values = {} }: { values?: VideoValues }) {
  const [state, formAction] = useActionState<VideoFormState, FormData>(saveVideo, initial);

  const [url, setUrl] = useState(values.youtubeUrl ?? '');
  const editing = Boolean(values.id);

  /**
   * What a field should show right now.
   *
   * Values echoed back by a refused save win over the record's stored values,
   * because React resets the form to `defaultValue` once the action settles.
   */
  const shown = (key: string, fallback: string | number | undefined) =>
    state.values?.[key] ?? String(fallback ?? '');

  // The same function the server uses. Empty input is not an error yet — the
  // teacher has not finished typing.
  const previewId = parseYouTubeId(url);
  const showsUnrecognised = url.trim().length > 0 && !previewId;

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
        <h2 className="mb-1 font-display text-[18px] font-semibold text-heading">
          The video
        </h2>
        <p className="measure mb-5 text-small text-muted">
          Videos stay on YouTube. This adds one to the website; it does not
          upload or copy anything, and removing it here does not remove it from
          YouTube.
        </p>

        <div className="flex flex-col gap-5">
          <Field
            name="youtubeUrl"
            label="YouTube video link"
            hint="Paste the address from the video page — https://www.youtube.com/watch?v=… or https://youtu.be/…"
            required
            error={state.errors?.youtubeUrl}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="url"
                maxLength={500}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={inputClass(Boolean(state.errors?.youtubeUrl))}
              />
            )}
          </Field>

          {/*
            The preview proves the link resolved to the video the teacher meant.
            It renders the poster only — no iframe in the admin, for the same
            reason there is none on the public page until asked.
          */}
          {previewId ? (
            <div className="flex items-start gap-4 rounded-sm border border-rule bg-surface p-3">
              <Image
                src={thumbnailUrl(previewId)}
                alt=""
                width={160}
                height={90}
                unoptimized
                className="h-[90px] w-[160px] shrink-0 rounded-sm object-cover"
              />
              <div className="min-w-0 text-small">
                <p className="font-medium text-heading">This video will be shown</p>
                <p className="mt-1 break-all text-[13px] text-muted">{previewId}</p>
                <a
                  href={watchUrl(previewId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[13px] text-link underline"
                >
                  Check it on YouTube
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </div>
          ) : null}

          {showsUnrecognised ? (
            <Notice tone="warn" title="That is not a YouTube video link yet">
              <p>
                Open the video on YouTube and copy the address from the browser,
                or use the Share button. An embed code or a channel address will
                not work here.
              </p>
            </Notice>
          ) : null}

          <Field
            name="title"
            label="Title"
            hint="Your own wording, shown on the website. It does not have to match the title on YouTube."
            required
            error={state.errors?.title}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={160}
                defaultValue={shown('title', values.title)}
                className={inputClass(Boolean(state.errors?.title))}
              />
            )}
          </Field>

          <Field
            name="description"
            label="Description"
            hint="Optional. One or two sentences about what the video covers."
            error={state.errors?.description}
          >
            {(props) => (
              <textarea
                {...props}
                rows={3}
                maxLength={400}
                defaultValue={shown('description', values.description)}
                className={textareaClass(Boolean(state.errors?.description))}
              />
            )}
          </Field>

          <Field name="subject" label="Subject" required error={state.errors?.subject}>
            {(props) => (
              <select
                {...props}
                defaultValue={shown('subject', values.subject)}
                className={selectClass(Boolean(state.errors?.subject))}
              >
                <option value="">Choose one</option>
                {VIDEO_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {SUBJECT_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-5 font-display text-[18px] font-semibold text-heading">
          Showing on the website
        </h2>

        <div className="flex flex-col gap-5">
          <Field
            name="priority"
            label="Order"
            hint="Higher numbers appear first. Leave at 0 unless you want this one at the top."
            error={state.errors?.priority}
          >
            {(props) => (
              <input
                {...props}
                type="number"
                min={0}
                max={1000}
                step={1}
                defaultValue={shown('priority', values.priority)}
                className={inputClass(Boolean(state.errors?.priority))}
              />
            )}
          </Field>

          <div className="flex items-start gap-3">
            <input
              id="v-published"
              name="published"
              type="checkbox"
              defaultChecked={
                state.values
                  ? state.values.published === 'on'
                  : (values.published ?? false)
              }
              className="mt-1 h-5 w-5 shrink-0 rounded-sm border-rule-strong accent-navy-800"
            />
            <label htmlFor="v-published" className="text-small text-text">
              Show this video on the website
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
          href="/admin/videos"
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
      {pending ? 'Saving…' : editing ? 'Save changes' : 'Add video'}
    </Button>
  );
}
