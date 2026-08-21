'use server';

import { headers } from 'next/headers';
import { submitEnquiry, clientIpFrom } from '@/lib/enquiry';
import type { EnquiryFormState } from './form-state';

/**
 * Server Action for the enquiry form.
 *
 * PROGRESSIVE ENHANCEMENT: this is invoked by a plain <form action={...}>.
 * With JavaScript, useActionState renders the returned state inline. Without
 * JavaScript, React posts the form, runs this action on the server, and
 * re-renders the page with the same state — so the form works either way.
 *
 * The browser never touches the database. Everything below runs on the server;
 * the modules it calls import 'server-only', so a client import is a build
 * error rather than a runtime leak.
 */

function asString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

export async function submitEnquiryAction(
  _prevState: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  const requestHeaders = await headers();
  const ip = clientIpFrom(requestHeaders);

  const raw = {
    name: asString(formData.get('name')),
    phone: asString(formData.get('phone')),
    email: asString(formData.get('email')),
    classLevel: asString(formData.get('classLevel')),
    courseSlug: asString(formData.get('courseSlug')),
    message: asString(formData.get('message')),
    sourcePage: asString(formData.get('sourcePage')),
    consent: asString(formData.get('consent')),
    website: asString(formData.get('website')),
    formToken: asString(formData.get('formToken')),
  };

  const outcome = await submitEnquiry(raw, ip);

  // Re-populating the form after a failure hands the visitor their own input
  // back within their own session. It is not logged and not stored.
  const values = {
    name: raw.name,
    phone: raw.phone,
    email: raw.email,
    classLevel: raw.classLevel,
    message: raw.message,
  };

  switch (outcome.status) {
    case 'success':
      // Nothing echoed: the form is replaced by a confirmation, so there is
      // no reason to keep the data in the rendered payload.
      return { status: 'success', errors: {} };

    case 'invalid':
      return { status: 'invalid', errors: outcome.errors, values };

    case 'rate-limited':
      return { status: 'rate-limited', errors: {}, values };

    case 'unavailable':
      return {
        status: 'unavailable',
        errors: {},
        ...(outcome.ref ? { ref: outcome.ref } : {}),
        values,
      };
  }
}
