import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Form field wrapper — Master Plan §09 and §20.
 *
 * Labels are ALWAYS visible and always above the field. Placeholder-as-label
 * fails for screen readers, disappears the moment someone starts typing, and
 * leaves people who were interrupted with no idea what the field was for.
 *
 * Errors are text, tied to the input with aria-describedby, and never signalled
 * by colour alone.
 */
export function Field({
  name,
  label,
  error,
  hint,
  required,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: {
    id: string;
    name: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
    'aria-required'?: true;
  }) => ReactNode;
}) {
  const id = `f-${name}`;
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-text">
        {label}
        {required ? (
          <span className="ml-1 text-accent-text" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-2 font-normal text-muted">(optional)</span>
        )}
      </label>

      {hint ? (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}

      {children({
        id,
        name,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(required ? { 'aria-required': true as const } : {}),
      })}

      {error ? (
        <p id={errorId} className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const control =
  'w-full rounded-sm border bg-paper px-3 py-2.5 text-base text-text ' +
  'transition-colors placeholder:text-muted/70 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-navy-600';

/** 16px minimum: below that, iOS Safari zooms on focus and the layout jumps. */
export const inputClass = (hasError?: boolean) =>
  cn(control, hasError ? 'border-danger' : 'border-rule-strong hover:border-muted');

export const selectClass = inputClass;

export const textareaClass = (hasError?: boolean) =>
  cn(inputClass(hasError), 'min-h-28 resize-y leading-relaxed');
