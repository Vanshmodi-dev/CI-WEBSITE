'use client';

import Image from 'next/image';
import { useCallback, useId, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { uploadMedia } from '@/app/admin/(dashboard)/media/actions';
import { MEDIA_LIMITS, checkSize } from '@/lib/media/format';

/**
 * Choose a photograph — the one control every photo field on the site uses.
 *
 * =============================================================================
 * WHAT THIS REPLACES
 * =============================================================================
 * A text box that a teacher was expected to type `/photos/example.jpg` into,
 * having first sent the file to a developer to put it there. That is the
 * dependency the admin panel exists to remove, and it is why this component is
 * shared rather than written twice.
 *
 * =============================================================================
 * "TAKE PHOTO" IS A FILE INPUT, NOT A CAMERA
 * =============================================================================
 * There is no camera API here and there should not be. `<input type="file"
 * capture="environment">` asks the operating system to open the camera, and the
 * OS decides — which is the behaviour a phone user already understands, needs no
 * permission prompt of our own, and cannot leave a live camera stream running
 * inside an admin page.
 *
 * `capture` is IGNORED by desktop browsers rather than erroring, so the
 * degradation is free. The button is still hidden on pointer-precise devices,
 * because a "Take photo" button that opens a file dialog is a small lie.
 *
 * =============================================================================
 * THE PHOTO IS OPTIONAL AND MUST STAY OPTIONAL
 * =============================================================================
 * The value lives in a plain hidden input that the PARENT form submits. When no
 * photo is chosen it submits an empty string, which every consuming action
 * already treats as "no photo". Nothing here marks anything required, and a
 * regression test saves a record with no photograph to keep it that way — the
 * project has already shipped one field whose help text said "optional" while
 * validation refused it empty.
 */
export function MediaField({
  name,
  label,
  value,
  hint,
  error,
  onChange,
}: {
  /** Form field name the parent action reads, e.g. `photoUrl`. */
  name: string;
  label: string;
  /** Current stored path, or empty. */
  value: string;
  hint?: string;
  error?: string;
  /** Lets a parent mirror the value into its own live preview. */
  onChange?: (path: string) => void;
}) {
  /*
    CONTROLLED BY THE PARENT, AND THE ACTION IS CALLED DIRECTLY.

    The obvious build is `useActionState` plus an effect that copies the result
    into local state when an upload succeeds. React's lint rule rejects a
    setState inside an effect, and it is right to: the copy would run after
    paint, so the field would render the old photo for a frame, and a parent
    re-render could re-apply a stale path over a newer one.

    A Server Action is just an async function, so it is called directly inside a
    transition and the result is handled in the CONTINUATION OF AN EVENT - which
    is where a state update belongs. `path` then has exactly one owner, the
    parent, and this component never holds a second copy that can disagree
    with it.
  */
  const path = value;
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const statusId = useId();
  const errorId = useId();

  /**
   * Coarse pointer means a touch device, which is where a camera button belongs.
   *
   * Subscribed rather than read once into state in an effect. Reading it in an
   * effect means a setState after paint - which React's lint rule refuses, and
   * which would also render the wrong button set for one frame. It would also
   * never notice a change: a tablet with a keyboard attached and detached
   * switches pointer type while the page is open, and this follows it.
   *
   * The server snapshot is `false`, so the markup React sends matches what a
   * desktop renders and hydration has nothing to reconcile.
   */
  const showCamera = useSyncExternalStore(
    useCallback((onChangeNotify: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
      }
      const query = window.matchMedia('(pointer: coarse)');
      query.addEventListener('change', onChangeNotify);
      return () => query.removeEventListener('change', onChangeNotify);
    }, []),
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );

  function send(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setNote(null);

    /*
      SIZE IS CHECKED HERE TOO, AND THIS IS NOT A SECURITY CONTROL.

      The server checks it again and the server is what decides — this cannot
      be trusted and is not relied on. It exists because of what happened
      without it: a file above the framework's request-body limit was rejected
      by Next BEFORE the action ran, the promise rejected, nothing caught it,
      and the control sat on "Uploading photo…" forever. The teacher was told
      nothing at all.

      Refusing here means an oversized photo never leaves the browser, the
      message is immediate and accurate, and the person is not left waiting on
      a 20 MB upload that was always going to fail.
    */
    const local = checkSize(file.size);
    if (!local.ok) {
      setUploadError(local.message);
      return;
    }

    const data = new FormData();
    data.set('file', file);

    startTransition(async () => {
      try {
        const result = await uploadMedia({ status: 'idle' }, data);
        if (result.status === 'uploaded' && result.path) {
          onChange?.(result.path);
          setNote(
            `${result.message} ${result.width}×${result.height}, ` +
              `${Math.round((result.bytes ?? 0) / 1024)} KB.`,
          );
        } else {
          // The refusal is shown and the EXISTING photo is left alone. A failed
          // upload must never be able to clear a record's current picture.
          setUploadError(result.message ?? 'That photo could not be uploaded.');
        }
      } catch {
        /*
          The action itself failed to complete: the network dropped, or the
          request was refused before it ran. Without this catch the transition
          simply ends and the status line keeps saying "Uploading photo…" with
          no way out. Any failure must produce a sentence.
        */
        setUploadError(
          'That photo could not be sent. Check your connection and try again. ' +
            'If it is a very large photo, try a smaller copy.',
        );
      }
    });
  }

  function clear() {
    setNote(null);
    setUploadError(null);
    onChange?.('');
    /*
      The stored file is NOT deleted here, deliberately.

      "Remove" means "this record no longer shows this photograph". The bytes
      may still be used by another record, and destroying them because one form
      cleared a field would break a page somebody else is looking at. Deleting
      the file is a separate, explicit action in the media library, and it
      refuses while anything still references it.
    */
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  }

  const busy = pending;
  const showError = error ?? uploadError ?? undefined;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-small font-medium text-text">
        {label}
        <span className="ml-2 font-normal text-muted">(optional)</span>
      </span>
      {hint ? <p className="text-[13px] text-muted">{hint}</p> : null}

      {/* What the parent form actually submits. */}
      <input type="hidden" name={name} value={path} />

      <div className="flex flex-wrap items-start gap-4">
        <div
          className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-rule bg-surface"
          aria-hidden="true"
        >
          {path ? (
            /*
              `aria-hidden` on the frame and an empty alt on the image: this is
              a preview of a choice the surrounding controls already describe.
              Announcing "photo preview" after "Photo, Replace, Remove" adds a
              stop for a screen-reader user and tells them nothing new.
            */
            <Image
              src={path}
              alt=""
              width={96}
              height={96}
              className="h-24 w-24 object-cover"
              unoptimized
            />
          ) : (
            <span className="px-2 text-center text-[12px] leading-tight text-muted">
              No photo
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-sm border border-rule px-3 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected disabled:opacity-50"
            >
              {path ? 'Replace photo' : 'Choose photo'}
            </button>

            {showCamera ? (
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={busy}
                className="inline-flex min-h-11 items-center rounded-sm border border-rule px-3 text-small font-medium text-text transition-colors hover:border-navy-600/50 hover:bg-selected disabled:opacity-50"
              >
                Take photo
              </button>
            ) : null}

            {path ? (
              <button
                type="button"
                onClick={clear}
                disabled={busy}
                className="inline-flex min-h-11 items-center rounded-sm px-3 text-small font-medium text-muted transition-colors hover:text-danger disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
          </div>

          {/*
            A live region, so the outcome is announced rather than only shown.
            `polite` because an upload finishing should not interrupt whatever
            the person is reading or typing.
          */}
          <p id={statusId} role="status" aria-live="polite" className="text-[13px] text-muted">
            {busy
              ? 'Uploading photo…'
              : (note ??
                (path
                  ? 'A photo is attached to this record.'
                  : `JPG, PNG, WebP or AVIF, up to ${Math.round(MEDIA_LIMITS.maxBytes / 1024 / 1024)} MB.`))}
          </p>

          {showError ? (
            <p id={errorId} role="alert" className="measure text-[13px] font-medium text-danger">
              {showError}
            </p>
          ) : null}
        </div>
      </div>

      {/*
        Two inputs rather than one whose `capture` is toggled: changing the
        attribute after the element exists is unreliable across browsers, and
        two hidden inputs cost nothing.

        `accept` lists the four formats. It is a CONVENIENCE - it filters the
        picker - and nothing more. The server decides by reading the bytes,
        because `accept` is trivially bypassed and is not a security control.
      */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => send(e.target.files?.[0])}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => send(e.target.files?.[0])}
      />
    </div>
  );
}
