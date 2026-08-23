/**
 * Shared state shape for the sign-in form.
 *
 * NOT in actions.ts: a 'use server' module may only export async functions, so
 * exporting a plain object from there yields undefined at runtime. That bug
 * cost real debugging time in Phase 4 — see docs/PHASE-4-REPORT.md.
 */
export type LoginState = {
  status: 'idle' | 'error' | 'unavailable';
  message?: string;
};

export const initialLoginState: LoginState = { status: 'idle' };
