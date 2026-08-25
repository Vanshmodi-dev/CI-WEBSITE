/**
 * Lost-update protection for admin edit forms — PURE, no imports.
 *
 * =============================================================================
 * THE SCENARIO THIS EXISTS FOR (Phase 14)
 * =============================================================================
 * A teacher opens a student's edit page. While it is open — another tab, a
 * phone, a colleague — a parent rings and asks for their child's photograph to
 * be taken down, and it is: photo consent withdrawn, record unpublished.
 *
 * The teacher then returns to the first tab and presses Save without changing
 * anything. That form still carries the values from before the withdrawal, so
 * the save wrote them back.
 *
 * Phase 14 measured exactly that against a running server:
 *
 *   after withdrawal : consentPhoto=false, photoUrl=null, published=false
 *   after stale save : consentPhoto=true,  photoUrl='/…jpg', published=true
 *
 * The child's photograph went back onto the public website, the record
 * re-published itself, and the teacher got a success redirect. Nothing warned
 * anybody. This is the "remove my child's photograph immediately" case failing
 * quietly, which is the worst way for it to fail.
 *
 * =============================================================================
 * THE GUARD
 * =============================================================================
 * The edit form carries the record's `updatedAt` as a hidden field. The save
 * requires it to still match, via `updateMany({ where: { id, updatedAt } })` —
 * if the row moved underneath, the count comes back 0 and the whole
 * transaction is abandoned rather than half-applied.
 *
 * `updatedAt` is a `@updatedAt` column, so Prisma advances it on every write.
 * It needs no new column, no migration, and no CHECK constraint — which matters,
 * because Phase 12 established that regenerating a migration silently drops
 * every constraint this project depends on.
 */

/** Hidden field name. One constant so the form and the action cannot drift. */
export const EDIT_TOKEN_FIELD = 'editedAt';

/**
 * What the teacher is told. Deliberately not "conflict" or "stale write":
 * it says what happened, what it protected, and what to do next.
 */
export const STALE_EDIT_MESSAGE =
  'Someone changed this record while you had it open, so nothing was saved. ' +
  'Open it again to see the current version, then make your change. ' +
  'This protects a permission that may have been withdrawn in the meantime.';

/**
 * Read the token a form sent back.
 *
 * Returns `null` when it is absent or unparseable, and the caller decides what
 * that means. For a NEW record there is nothing to compare against, so null is
 * correct; for an edit, a null token is itself a reason to refuse, because a
 * form that lost its token cannot prove it was looking at the current row.
 */
export function parseEditToken(raw: unknown): Date | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Serialise a record's `updatedAt` for the hidden field. */
export function editToken(updatedAt: Date | string | null | undefined): string {
  if (!updatedAt) return '';
  const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * Thrown inside the transaction so nothing partial is committed.
 *
 * A plain sentinel rather than a returned flag: the student save also deletes
 * and recreates subject rows, and those must not survive a refused update.
 */
export class StaleEditError extends Error {
  constructor() {
    super('STALE_EDIT');
    this.name = 'StaleEditError';
  }
}

export function isStaleEditError(error: unknown): boolean {
  return error instanceof StaleEditError || (error as { name?: string })?.name === 'StaleEditError';
}
