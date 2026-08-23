'use client';

import { useState, useTransition } from 'react';
import { updateEnquiryStatus, saveEnquiryNotes } from '../actions';
import { Card } from '@/components/admin/ui';
import { Button } from '@/components/primitives/button';
import { textareaClass } from '@/components/primitives/field';

const STATUSES = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'ENROLLED', label: 'Enrolled' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'SPAM', label: 'Spam' },
] as const;

/**
 * Status and follow-up note.
 *
 * Client-side only for the "Saved." confirmation and the pending state — the
 * mutations themselves are server actions that re-check authorisation.
 */
export function EnquiryControls({
  id,
  status,
  notes,
}: {
  id: string;
  status: string;
  notes: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  function run(formData: FormData, fn: (fd: FormData) => Promise<{ ok: boolean; message: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn(formData);
      setError(!result.ok);
      setMessage(result.message);
    });
  }

  return (
    <Card>
      <h2 className="font-display text-[18px] font-semibold text-heading">
        Follow-up
      </h2>

      {message ? (
        <p
          role="status"
          className={
            error
              ? 'mt-3 rounded-sm border border-danger/40 bg-danger-bg px-3 py-2 text-small'
              : 'mt-3 rounded-sm border border-ok/40 bg-ok-bg px-3 py-2 text-small'
          }
        >
          {message}
        </p>
      ) : null}

      <form
        action={(fd) => {
          fd.set('id', id);
          run(fd, updateEnquiryStatus);
        }}
        className="mt-4"
      >
        <label htmlFor="status" className="text-small font-medium text-text">
          Status
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="min-h-11 rounded-sm border border-rule-strong bg-paper px-3 text-base text-text sm:w-56"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={pending} variant="secondary">
            {pending ? 'Saving…' : 'Update status'}
          </Button>
        </div>
      </form>

      <form
        action={(fd) => {
          fd.set('id', id);
          run(fd, saveEnquiryNotes);
        }}
        className="mt-6 border-t border-rule pt-5"
      >
        <label htmlFor="notes" className="text-small font-medium text-text">
          Your notes
        </label>
        <p className="mt-0.5 text-[13px] text-muted">
          Only you can see this. It never appears on the website.
        </p>
        <textarea
          id="notes"
          name="notes"
          defaultValue={notes}
          rows={4}
          maxLength={2000}
          className={`${textareaClass(false)} mt-2`}
        />
        <div className="mt-3">
          <Button type="submit" disabled={pending} variant="secondary">
            {pending ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
