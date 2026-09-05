'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveWebsiteContent, type WebsiteFormState } from './actions';
import { Card, Notice } from '@/components/admin/ui';
import { Field, inputClass, textareaClass } from '@/components/primitives/field';
import { Button } from '@/components/primitives/button';
import type { FieldView, FieldGroup } from '@/config/site-content';
import { EDIT_TOKEN_FIELD } from '@/lib/stale-edit';
import { Checkbox } from '@/components/primitives/checkbox';
import { MediaField } from '@/components/admin/media-field';

const initial: WebsiteFormState = { status: 'idle' };

/**
 * One editable group, one form, one save button.
 *
 * WHY NOT ONE BIG FORM FOR THE WHOLE SITE. Because a validation error in the
 * PIN code would then block a change to the homepage headline, and because a
 * single save touching every key makes the audit entry useless — "updated 34
 * fields" tells nobody anything. One form per group keeps a save small enough
 * that the person doing it can see exactly what they changed.
 *
 * Every input is pre-filled with what the site currently shows, whether that
 * came from the database or from the code default. The teacher edits the real
 * site, never an empty box next to a greyed-out "current value" they have to
 * copy by hand.
 */
export function GroupForm({
  group,
  fields,
  values,
  lastEdited,
  token,
}: {
  group: FieldGroup;
  fields: readonly FieldView[];
  /** Resolved values — stored where stored, code default otherwise. */
  values: Readonly<Record<string, string>>;
  lastEdited: string | null;
  /**
   * The latest `updatedAt` across this group's stored rows, so a save can
   * detect that somebody else changed one while this form was open.
   */
  token: string;
}) {
  const [state, formAction] = useActionState<WebsiteFormState, FormData>(
    saveWebsiteContent,
    initial,
  );

  // A saved/error message from a DIFFERENT group's form must not appear over
  // this one. Each form has its own action state, but the group check also
  // covers a re-render carrying stale state.
  const mine = state.group === undefined || state.group === group.id;
  const errors = mine ? (state.errors ?? {}) : {};

  return (
    <Card className="scroll-mt-24" >
      <form action={formAction} className="flex flex-col gap-6">
        <input type="hidden" name="group" value={group.id} />
        <input type="hidden" name={EDIT_TOKEN_FIELD} value={token} />

        <header>
          <h2
            id={`group-${group.id}`}
            className="font-display text-[19px] font-semibold text-heading"
          >
            {group.title}
          </h2>
          <p className="measure mt-1.5 text-small text-muted">{group.blurb}</p>
          {lastEdited ? (
            <p className="mt-2 text-[13px] text-muted">
              Last changed {lastEdited}
            </p>
          ) : null}
        </header>

        {mine && state.status === 'saved' && state.message ? (
          <Notice tone="ok">{state.message}</Notice>
        ) : null}
        {mine && state.status === 'error' && state.message ? (
          <Notice tone="danger">{state.message}</Notice>
        ) : null}

        <div className="flex flex-col gap-5">
          {fields.map((field) =>
            field.kind === 'toggle' ? (
              <ToggleRow
                key={field.key}
                field={field}
                checked={(values[field.key] ?? 'on') === 'on'}
              />
            ) : field.kind === 'media' ? (
              <MediaRow
                key={field.key}
                field={field}
                value={values[field.key] ?? ''}
                error={errors[field.key]}
              />
            ) : (
              <Field
                key={field.key}
                name={field.key}
                label={field.label}
                /*
                  Emptying any field is allowed: on a blankable field it shows
                  nothing, and on the rest it restores the original wording.
                  Marking these `required` would put `aria-required` on the
                  input and tell a screen-reader user the form cannot be
                  submitted without them, which is not true.
                */
                hint={
                  field.help
                    ? `${field.help}${field.blankable ? '' : ' Clear it to restore the original wording.'}`
                    : field.blankable
                      ? undefined
                      : 'Clear it to restore the original wording.'
                }
                required={false}
                error={errors[field.key]}
              >
                {(props) =>
                  field.kind === 'line' ? (
                    <input
                      {...props}
                      type="text"
                      maxLength={field.maxLength}
                      defaultValue={values[field.key] ?? ''}
                      className={inputClass(Boolean(errors[field.key]))}
                    />
                  ) : (
                    <textarea
                      {...props}
                      rows={field.kind === 'lines' ? 4 : 3}
                      maxLength={field.maxLength}
                      defaultValue={values[field.key] ?? ''}
                      className={textareaClass(Boolean(errors[field.key]))}
                    />
                  )
                }
              </Field>
            ),
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-rule pt-5">
          <SaveButton />
          <p className="text-[13px] text-muted">
            Changes appear on the website straight away.
          </p>
        </div>
      </form>
    </Card>
  );
}

/**
 * A checkbox, worded as the question it actually asks.
 *
 * Not routed through `Field`, because `Field` puts the label above the control
 * and a checkbox reads correctly only with its label beside it.
 */
function ToggleRow({ field, checked }: { field: FieldView; checked: boolean }) {
  const id = `f-${field.key}`;
  return (
    <Checkbox
      id={id}
      name={field.key}
      defaultChecked={checked}
      label={field.label}
      description={field.help}
    />
  );
}

/**
 * A photograph field inside the website editor.
 *
 * ⚠ IT IS THE SAME CONTROL EVERY OTHER PHOTO FIELD USES, ON PURPOSE.
 *
 * `MediaField` already carries the upload, the client-side preview, the
 * "choose one you have already uploaded" library and the take-a-photo path on
 * a phone. Writing a second, simpler picker here - a text box for a path, say -
 * would reintroduce exactly the thing the media pipeline was built to remove,
 * and it would be the only photo field on the site that behaved differently.
 *
 * `required` is false because clearing this field is meaningful: an empty value
 * is stored, and `resolveContent` turns it back into the generated brand card.
 * That is the registry's usual "clearing a box is an undo" rule, and the reason
 * this field is not `blankable` - see `SHARING_FIELDS` in site-content.ts.
 */
function MediaRow({
  field,
  value,
  error,
}: {
  field: FieldView;
  value: string;
  error?: string;
}) {
  /*
    The stored fallback is a static asset rather than an uploaded one, and
    `MediaField` renders a preview for anything it is given. Passing the brand
    card through unchanged is right: the teacher sees the picture that is
    actually in use today, which is what makes "replace it" an informed choice
    rather than a blind one.
  */
  return (
    <MediaField
      name={field.key}
      label={field.label}
      value={value}
      hint={field.help}
      error={error}
      required={false}
    />
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save changes'}
    </Button>
  );
}
