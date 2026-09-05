/**
 * Shared state shape for the storage refresh action.
 *
 * NOT in actions.ts: a 'use server' module may only export async functions, so
 * exporting a plain object from there yields undefined at runtime. That bug
 * cost real debugging time in Phase 4 — see docs/PHASE-4-REPORT.md, and the
 * same note on src/app/admin/login/state.ts.
 */
export type RefreshState = {
  status: 'idle' | 'done' | 'error';
  message?: string;
};

export const initialRefreshState: RefreshState = { status: 'idle' };
