'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInAction } from './actions';
import { initialLoginState, type LoginState } from './state';
import { Field, inputClass } from '@/components/primitives/field';
import { Button } from '@/components/primitives/button';
import { cn } from '@/lib/cn';

/**
 * Sign-in form.
 *
 * Progressive: `useActionState` posts the form and re-renders with the returned
 * state even with JavaScript disabled. The client JS buys inline errors and a
 * disabled button while submitting.
 */
export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(
    signInAction,
    initialLoginState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.status !== 'idle' && state.message ? (
        <div
          role="alert"
          className="rounded-sm border border-danger/40 bg-danger-bg px-3 py-2.5 text-small text-text"
        >
          {state.message}
        </div>
      ) : null}

      <Field name="email" label="Email" required>
        {(props) => (
          <input
            {...props}
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            className={inputClass(state.status === 'error')}
          />
        )}
      </Field>

      <PasswordField hasError={state.status === 'error'} />

      <SubmitButton />
    </form>
  );
}

/**
 * Password, with a reveal toggle.
 *
 * =============================================================================
 * WHY THIS EXISTS
 * =============================================================================
 * A masked field cannot be proof-read. A typo is entered once, confirmed by a
 * row of identical asterisks, and the only feedback is "that email or password
 * is not correct" — which reads as a broken account rather than a slipped key.
 * That is not hypothetical here: it is exactly how an admin password was set to
 * a value nobody could reproduce, and it cost an evening.
 *
 * The toggle is DEFAULT OFF and resets to off on every render of a fresh page,
 * so the field is masked unless somebody deliberately asks otherwise. Revealing
 * is a decision the person makes about their own screen.
 *
 * =============================================================================
 * ACCESSIBILITY NOTES, BECAUSE THIS CONTROL IS EASY TO GET WRONG
 * =============================================================================
 *   - `type="button"`. Without it a <button> inside a form SUBMITS, so clicking
 *     the eye would post a half-typed password.
 *   - `aria-pressed` carries the state, so a screen reader announces "Show
 *     password, pressed" rather than leaving the toggle's condition to the icon.
 *   - The accessible name is real text in `.sr-only`, not a `title` or an
 *     `aria-label` on an icon. `title` is not reliably announced and vanishes on
 *     touch.
 *   - 48x~46px, comfortably past the 24x24 WCAG 2.5.8 minimum that
 *     `scripts/verify-ux.mjs` enforces.
 *   - `tabIndex={-1}` was considered and REJECTED. Keeping it out of the tab
 *     order would hide the control from exactly the keyboard-only users most
 *     likely to want it.
 */
function PasswordField({ hasError }: { hasError: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const label = revealed ? 'Hide password' : 'Show password';

  return (
    <Field name="password" label="Password" required>
      {(props) => (
        <div className="relative">
          <input
            {...props}
            /*
              The ONLY thing the toggle changes. Note that `autoComplete` stays
              "current-password" in both states: browsers key their password
              manager off that, and dropping it when revealed would break
              autofill for anyone who toggles first and types second.
            */
            type={revealed ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className={cn(inputClass(hasError), 'pr-12')}
          />

          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-pressed={revealed}
            aria-controls={props.id}
            className={cn(
              'absolute inset-y-0 right-0 flex w-12 items-center justify-center',
              'rounded-r-sm text-muted transition-colors',
              'hover:text-text',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-navy-600',
            )}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
            <span className="sr-only">{label}</span>
          </button>
        </div>
      )}
    </Field>
  );
}

/* --------------------------------------------------------------- icons -- */
/* Inline, matching src/components/domain/site-header.tsx: 24x24 box,
   currentColor, 1.75 stroke. No icon package is worth a dependency for two
   glyphs. */

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9.9 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.3 4M6.4 7.5A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 4l16 16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  );
}
