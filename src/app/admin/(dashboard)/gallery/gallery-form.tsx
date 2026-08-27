'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { saveGalleryItem, type GalleryFormState } from './actions';
import { Card, Notice } from '@/components/admin/ui';
import { MediaField } from '@/components/admin/media-field';
import { Field, inputClass, selectClass } from '@/components/primitives/field';
import { Button } from '@/components/primitives/button';
import { EDIT_TOKEN_FIELD } from '@/lib/stale-edit';
import {
  GALLERY_CATEGORIES,
  CATEGORY_LABEL,
  galleryBlockers,
  type GalleryCategoryValue,
} from '@/lib/gallery';

const initial: GalleryFormState = { status: 'idle' };

export type GalleryValues = {
  id?: string;
  imageUrl?: string;
  alt?: string;
  caption?: string;
  category?: GalleryCategoryValue;
  priority?: number;
  published?: boolean;
  showsPeople?: boolean;
  consentRef?: string;
  consentPhoto?: boolean;
  /** The row's `updatedAt`, for the lost-update guard. Absent when creating. */
  editedAt?: string;
};

/**
 * Add or edit a gallery photograph.
 *
 * =============================================================================
 * THE CONSENT PANEL IS THE POINT OF THIS FORM
 * =============================================================================
 * `docs/design/STUDENT-DATA-POLICY.md` covers gallery photographs, so the
 * teacher filling this in may be publishing a picture of somebody else's child.
 * The form is arranged so that fact is unavoidable rather than buried at the
 * bottom: the consent questions sit between the photograph and the publish
 * control, in that order, because that is the order the decision happens in.
 *
 * =============================================================================
 * THE BLOCKER LIST IS COMPUTED BY THE SAME FUNCTION THE SERVER USES
 * =============================================================================
 * `galleryBlockers()` is imported here and called again on the server. It is
 * deliberately NOT re-implemented for the browser: a second copy of a consent
 * rule is a second answer waiting to disagree with the first, and the one that
 * disagrees quietly is the one that publishes a photograph it should not have.
 *
 * `src/lib/validation.ts` documents that it stays free of `server-only` so it
 * can be shared this way, and `src/lib/gallery.ts` inherits that.
 *
 * This is a CONVENIENCE, not a control. The browser copy tells the teacher what
 * to do next; the server copy decides, and a database CHECK constraint decides
 * again after that.
 */
export function GalleryForm({ values = {} }: { values?: GalleryValues }) {
  const [state, formAction] = useActionState<GalleryFormState, FormData>(
    saveGalleryItem,
    initial,
  );

  const [imageUrl, setImageUrl] = useState(values.imageUrl ?? '');
  const [showsPeople, setShowsPeople] = useState(values.showsPeople ?? true);
  const [consentRef, setConsentRef] = useState(values.consentRef ?? '');
  const [consentPhoto, setConsentPhoto] = useState(values.consentPhoto ?? false);

  const editing = Boolean(values.id);

  const blockers = galleryBlockers({
    imageUrl: imageUrl.length > 0 ? imageUrl : null,
    showsPeople,
    consentRef: consentRef.length > 0 ? consentRef : null,
    consentPhoto,
    published: true,
  });
  const canPublish = blockers.length === 0;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {/* Absent when creating; the action treats a missing token on an EDIT as
          stale, which is what refuses a form that lost track of its version. */}
      <input type="hidden" name={EDIT_TOKEN_FIELD} value={values.editedAt ?? ''} />

      {state.status === 'error' && state.message ? (
        <Notice tone="danger">{state.message}</Notice>
      ) : null}

      <Card>
        <h2 className="mb-1 font-display text-[18px] font-semibold text-heading">
          The photograph
        </h2>
        {/*
          THIS PHOTO IS REQUIRED, AND SAYING SO IS THE WHOLE RULE.

          Every other photo field on the site is optional and must stay that
          way. This one is genuinely required — a gallery entry with no
          photograph is an empty box — so the label says required, the hint
          says it, and the server refuses it. What must never happen is a field
          labelled optional that validation rejects, which this project has
          already shipped once.
        */}
        <p className="measure mb-5 text-small text-muted">
          Every gallery entry needs a photograph. Landscape pictures work best.
        </p>

        <MediaField
          name="imageUrl"
          label="Photograph (required)"
          hint="JPG, PNG, WebP or AVIF. Taken on a phone is fine."
          value={imageUrl}
          error={state.errors?.imageUrl}
          onChange={setImageUrl}
        />

        <div className="mt-5 flex flex-col gap-5">
          <Field
            name="alt"
            label="Describe the photograph"
            hint="For people who cannot see it, and for search engines. For example: students working at desks in a classroom."
            required
            error={state.errors?.alt}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={200}
                defaultValue={values.alt ?? ''}
                className={inputClass(Boolean(state.errors?.alt))}
              />
            )}
          </Field>

          <Field
            name="caption"
            label="Caption"
            hint="Optional. A short line shown under the photograph."
            error={state.errors?.caption}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={300}
                defaultValue={values.caption ?? ''}
                className={inputClass(Boolean(state.errors?.caption))}
              />
            )}
          </Field>

          <Field
            name="category"
            label="Part of the gallery"
            required
            error={state.errors?.category}
          >
            {(props) => (
              <select
                {...props}
                defaultValue={values.category ?? ''}
                className={selectClass(Boolean(state.errors?.category))}
              >
                <option value="">Choose one</option>
                {GALLERY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-display text-[18px] font-semibold text-heading">
          Who is in it
        </h2>
        <p className="measure mb-5 text-small text-muted">
          Most students here are under 18. A photograph of somebody else&rsquo;s
          child stays off the website until you record that the institute has
          their permission on file.
        </p>

        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <input
              id="g-showsPeople"
              name="showsPeople"
              type="checkbox"
              checked={showsPeople}
              onChange={(e) => setShowsPeople(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 rounded-sm border-rule-strong accent-navy-800"
            />
            <label htmlFor="g-showsPeople" className="text-small text-text">
              You can recognise somebody in this photograph
              <span className="mt-0.5 block text-[13px] text-muted">
                Leave this ticked unless the photograph is only of the building,
                a classroom or equipment. If you are not sure, leave it ticked.
              </span>
            </label>
          </div>

          {/*
            The consent fields stay MOUNTED when `showsPeople` is unticked, and
            are only visually hidden, so their values still submit. A teacher
            who unticks the box by mistake and re-ticks it does not silently
            lose the reference they already typed.
          */}
          <div className={showsPeople ? 'flex flex-col gap-5' : 'hidden'}>
            <Field
              name="consentRef"
              label="Consent form reference"
              hint="Where the signed permission is filed, for example a form number or a folder name."
              error={state.errors?.consentRef}
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  maxLength={200}
                  value={consentRef}
                  onChange={(e) => setConsentRef(e.target.value)}
                  className={inputClass(Boolean(state.errors?.consentRef))}
                />
              )}
            </Field>

            <div className="flex items-start gap-3">
              <input
                id="g-consentPhoto"
                name="consentPhoto"
                type="checkbox"
                checked={consentPhoto}
                onChange={(e) => setConsentPhoto(e.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 rounded-sm border-rule-strong accent-navy-800"
              />
              <label htmlFor="g-consentPhoto" className="text-small text-text">
                Permission to publish this photograph
                <span className="mt-0.5 block text-[13px] text-muted">
                  Untick this if permission is withdrawn. The photograph comes
                  off the website straight away when you save.
                </span>
              </label>
            </div>
          </div>
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
                defaultValue={values.priority ?? 0}
                className={inputClass(Boolean(state.errors?.priority))}
              />
            )}
          </Field>

          {/*
            THE BLOCKERS ARE SHOWN, NOT THE CONTROL DISABLED.

            The student forms disable the publish control until consent allows
            it. Here the control stays operable and the reason is listed
            instead, because the server does the deciding either way: ticking
            this with a blocker outstanding saves the record UNPUBLISHED and
            says so, which is the behaviour a withdrawal needs. A disabled
            checkbox would leave a teacher unable to express "publish this once
            I have added the reference" in one pass.
          */}
          {!canPublish ? (
            <Notice tone="warn" title="This photograph cannot go on the website yet">
              <ul className="ml-4 list-disc">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <div className="flex items-start gap-3">
            <input
              id="g-published"
              name="published"
              type="checkbox"
              defaultChecked={values.published ?? false}
              className="mt-1 h-5 w-5 shrink-0 rounded-sm border-rule-strong accent-navy-800"
            />
            <label htmlFor="g-published" className="text-small text-text">
              Show this photograph on the website
              <span className="mt-0.5 block text-[13px] text-muted">
                Nothing appears publicly until this is ticked and the permission
                above is recorded.
              </span>
            </label>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-4">
        <SaveButton editing={editing} />
        <Link
          href="/admin/gallery"
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
      {pending ? 'Saving…' : editing ? 'Save changes' : 'Add photograph'}
    </Button>
  );
}
