import type { ValidationErrors } from '@/lib/validation';

/**
 * Shared shape for the enquiry form.
 *
 * DELIBERATELY NOT IN actions.ts. A module marked 'use server' may only export
 * async functions — Next strips anything else, so exporting the initial-state
 * OBJECT from there silently yields `undefined` at runtime and the form
 * crashes on first render. Values live here; only the action lives there.
 */
export type EnquiryFormState = {
  status: 'idle' | 'success' | 'invalid' | 'rate-limited' | 'unavailable';
  errors: ValidationErrors;
  /** Support reference for an unexpected failure. Never an internal detail. */
  ref?: string;
  /** Echoed back so a failed submission does not wipe what the visitor typed. */
  values?: {
    name: string;
    phone: string;
    email: string;
    classLevel: string;
    message: string;
  };
};

export const initialEnquiryState: EnquiryFormState = {
  status: 'idle',
  errors: {},
};
