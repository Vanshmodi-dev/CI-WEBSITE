'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { saveAnnouncement, type AnnouncementFormState } from './actions';
import { Card, Notice } from '@/components/admin/ui';
import { Field, inputClass, textareaClass } from '@/components/primitives/field';
import { Button } from '@/components/primitives/button';

const initial: AnnouncementFormState = { status: 'idle' };

export type AnnouncementValues = {
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

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      {state.status === 'error' && state.message ? (
        <Notice tone="danger">{state.message}</Notice>
      ) : null}

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
                defaultValue={values.message ?? ''}
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
                defaultValue={values.href ?? ''}
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
                defaultValue={values.startsAt ?? ''}
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
                defaultValue={values.endsAt ?? ''}
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
        <label className="mt-4 flex items-start gap-3 text-small text-text">
          <input
            type="checkbox"
            name="published"
            defaultChecked={values.published ?? false}
            className="mt-1 h-4 w-4 shrink-0 rounded-[3px] border-rule-strong accent-navy-800"
          />
          <span>
            <span className="font-medium">Show this on the website</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              Leave unticked to save it as a draft and publish later.
            </span>
          </span>
        </label>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton editing={editing} />
        <Link href="/admin/announcements" className="text-small text-link">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? 'Saving…' : editing ? 'Save changes' : 'Add announcement'}
    </Button>
  );
}
