'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { submitEnquiryAction } from './actions';
import { initialEnquiryState, type EnquiryFormState } from './form-state';
import { CLASS_LEVELS, CLASS_LEVEL_LABELS, LIMITS } from '@/lib/validation';
import { Field, inputClass, selectClass, textareaClass } from '@/components/primitives/field';
import { Checkbox } from '@/components/primitives/checkbox';
import { Button } from '@/components/primitives/button';
// The institute NAME is confirmed brand copy and is not editable, so it stays
// a static import. Only the contact details arrive as props.
import { institute } from '@/config/institute';


/**
 * Enquiry form.
 *
 * One of the few client components on the site (Master Plan §10). The client
 * JavaScript here buys inline error messages and a disabled-while-submitting
 * button — a clear user-facing benefit, which is the bar Decision 1 set.
 *
 * It still works WITHOUT JavaScript: `useActionState` is progressive, so the
 * plain form posts, the server action runs, and the page re-renders carrying
 * the same state.
 *
 * NOTHING here validates for real. Every check below is a convenience for the
 * visitor; the server re-validates everything and trusts none of it.
 */
export function EnquiryForm({
  formToken,
  sourcePage,
  courseSlug,
  phoneDisplay,
  whatsappHref,
}: {
  formToken: string;
  sourcePage: string;
  /**
   * The live phone number and WhatsApp link, passed in rather than imported.
   *
   * This is a client component, so it cannot read the edited contact details
   * itself. It used to import them from config, which meant the fallback
   * message shown when an enquiry FAILS to send — the one moment the visitor
   * most needs a working number — would have kept quoting the old one after a
   * change.
   */
  phoneDisplay: string;
  whatsappHref: string;
  courseSlug?: string;
}) {
  const [state, formAction] = useActionState<EnquiryFormState, FormData>(
    submitEnquiryAction,
    initialEnquiryState,
  );

  const headingRef = useRef<HTMLDivElement>(null);

  // Move focus to the outcome so a screen-reader user is told what happened
  // instead of being left at the bottom of an unchanged-sounding form.
  useEffect(() => {
    if (state.status !== 'idle') headingRef.current?.focus();
  }, [state.status]);

  if (state.status === 'success') {
    return (
      <div
        ref={headingRef}
        tabIndex={-1}
        className="rounded-md border border-ok/40 bg-ok-bg p-6"
      >
        <h2 className="font-display text-h3 font-semibold text-heading">
          Thank you — we have your enquiry.
        </h2>
        <p className="measure mt-2 text-small text-text">
          Someone from {institute.name} will call you back on the number you
          gave us. If you would rather talk now, WhatsApp us or call{' '}
          {phoneDisplay}.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button href={whatsappHref} external variant="secondary">
            Message on WhatsApp
          </Button>
        </div>
      </div>
    );
  }

  const v = state.values;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {/* Server-side context. Not trusted — re-checked and re-sanitised. */}
      <input type="hidden" name="formToken" value={formToken} />
      <input type="hidden" name="sourcePage" value={sourcePage} />
      {courseSlug ? (
        <input type="hidden" name="courseSlug" value={courseSlug} />
      ) : null}

      {/*
        Honeypot. Hidden from people and from assistive technology, so anything
        that fills it is automation. Not `type="hidden"` — bots skip those; a
        real-looking field they cannot see is what catches them.
      */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="f-website">Website</label>
        <input
          id="f-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      {state.status !== 'idle' ? (
        <div
          ref={headingRef}
          tabIndex={-1}
          role="alert"
          className="rounded-sm border border-danger/40 bg-danger-bg px-4 py-3 text-small text-text"
        >
          {state.status === 'invalid' ? (
            <>
              {state.errors.form ??
                'Please check the highlighted fields and try again.'}
            </>
          ) : null}
          {state.status === 'rate-limited' ? (
            <>
              You have sent several enquiries recently. Please give us a little
              time to respond, or call {phoneDisplay}.
            </>
          ) : null}
          {state.status === 'unavailable' ? (
            <>
              We could not save your enquiry just now. Please call{' '}
              {phoneDisplay} or try again shortly.
              {state.ref ? (
                <span className="block text-[13px] text-muted">
                  Reference: {state.ref}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <Field name="name" label="Your name" required error={state.errors.name}>
        {(props) => (
          <input
            {...props}
            type="text"
            defaultValue={v?.name ?? ''}
            maxLength={LIMITS.name.max}
            autoComplete="name"
            className={inputClass(Boolean(state.errors.name))}
          />
        )}
      </Field>

      <Field
        name="phone"
        label="Phone number"
        required
        hint="We will call you back on this number."
        error={state.errors.phone}
      >
        {(props) => (
          <input
            {...props}
            type="tel"
            inputMode="tel"
            defaultValue={v?.phone ?? ''}
            maxLength={20}
            autoComplete="tel"
            className={inputClass(Boolean(state.errors.phone))}
          />
        )}
      </Field>

      <Field name="email" label="Email" error={state.errors.email}>
        {(props) => (
          <input
            {...props}
            type="email"
            inputMode="email"
            defaultValue={v?.email ?? ''}
            maxLength={LIMITS.email.max}
            autoComplete="email"
            className={inputClass(Boolean(state.errors.email))}
          />
        )}
      </Field>

      <Field
        name="classLevel"
        label="Which class or course?"
        required
        error={state.errors.classLevel}
      >
        {(props) => (
          <select
            {...props}
            defaultValue={v?.classLevel ?? ''}
            className={selectClass(Boolean(state.errors.classLevel))}
          >
            <option value="">Please choose…</option>
            {CLASS_LEVELS.map((level) => (
              <option key={level} value={level}>
                {CLASS_LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        name="message"
        label="Anything you would like to ask?"
        error={state.errors.message}
      >
        {(props) => (
          <textarea
            {...props}
            defaultValue={v?.message ?? ''}
            maxLength={LIMITS.message.max}
            rows={4}
            className={textareaClass(Boolean(state.errors.message))}
          />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        {/*
          The one control a parent MUST tick to send an enquiry, and until
          Topic 11 the smallest thing on the page at 16x16. The shared
          primitive is 24x24 with the whole row as the hit area - see the note
          in `primitives/checkbox.tsx` for why no test had ever measured it.
        */}
        <Checkbox
          name="consent"
          value="on"
          aria-describedby={state.errors.consent ? 'consent-error' : undefined}
          aria-invalid={state.errors.consent ? true : undefined}
          label={
            <>
              I agree that {institute.name} may contact me about this enquiry by
              phone, WhatsApp or email.
            </>
          }
        />
        {state.errors.consent ? (
          <p id="consent-error" className="text-[13px] font-medium text-danger">
            {state.errors.consent}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}

/**
 * Separate component so useFormStatus can read the pending state of the
 * enclosing form. Without JavaScript this simply renders as a normal button.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="self-start">
      {pending ? 'Sending…' : 'Submit enquiry'}
    </Button>
  );
}
