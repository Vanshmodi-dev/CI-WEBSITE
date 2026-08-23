'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { saveBatch } from './actions';
import type { BatchFormState } from './actions';
import { Card, Notice } from '@/components/admin/ui';
import { Field, inputClass, selectClass } from '@/components/primitives/field';
import { Button } from '@/components/primitives/button';
import { institute } from '@/config/institute';

const initial: BatchFormState = { status: 'idle' };

const MODES = ['Offline', 'Online live', 'Offline + online live'];

export type BatchValues = {
  id?: string;
  courseSlug?: string;
  startsAt?: string;
  mode?: string;
  seatsNote?: string;
  published?: boolean;
};

/**
 * Add or edit a batch.
 *
 * Uses a real date picker rather than asking the teacher to type a date
 * string. The publishing control is worded as a plain question — "Show this
 * batch on the website" — not as a status field.
 */
export function BatchForm({ values = {} }: { values?: BatchValues }) {
  const [state, formAction] = useActionState<BatchFormState, FormData>(
    saveBatch,
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
          Batch details
        </h2>

        <div className="flex flex-col gap-5">
          <Field
            name="courseSlug"
            label="Which course?"
            required
            error={state.errors?.courseSlug}
          >
            {(props) => (
              <select
                {...props}
                defaultValue={values.courseSlug ?? ''}
                className={selectClass(Boolean(state.errors?.courseSlug))}
              >
                <option value="">Please choose…</option>
                {institute.courses.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field
            name="startsAt"
            label="Start date"
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
            name="mode"
            label="How does it run?"
            required
            error={state.errors?.mode}
          >
            {(props) => (
              <select
                {...props}
                defaultValue={values.mode ?? 'Offline'}
                className={selectClass(Boolean(state.errors?.mode))}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field
            name="seatsNote"
            label="Note about seats"
            hint='Optional. For example "Limited seats".'
          >
            {(props) => (
              <input
                {...props}
                type="text"
                maxLength={120}
                defaultValue={values.seatsNote ?? ''}
                className={inputClass(false)}
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
            <span className="font-medium">Show this batch on the website</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              Leave unticked to keep it as a draft. Batches that have already
              started stop appearing as “upcoming” on their own.
            </span>
          </span>
        </label>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton editing={editing} />
        <Link href="/admin/batches" className="text-small text-link">
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
      {pending ? 'Saving…' : editing ? 'Save changes' : 'Add batch'}
    </Button>
  );
}
