'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signInAction } from './actions';
import { initialLoginState, type LoginState } from './state';
import { Field, inputClass } from '@/components/primitives/field';
import { Button } from '@/components/primitives/button';

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

      <Field name="password" label="Password" required>
        {(props) => (
          <input
            {...props}
            type="password"
            autoComplete="current-password"
            required
            className={inputClass(state.status === 'error')}
          />
        )}
      </Field>

      <SubmitButton />
    </form>
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
