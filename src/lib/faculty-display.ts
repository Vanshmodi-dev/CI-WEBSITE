/**
 * How a member of teaching staff is presented — PURE, no imports, no I/O.
 *
 * Small, but separated for the same reason `student-display.ts` is: a function
 * that decides what a visitor sees should be testable without a database, and
 * a monogram is the fallback that renders when somebody has no photograph —
 * which, on a page whose whole job is putting faces to names, is the case worth
 * getting right rather than the exception.
 */

/** Field limits. Mirror the columns and the CHECK constraints exactly. */
export const FACULTY_LIMITS = {
  name: 120,
  designation: 120,
  subject: 120,
  bio: 600,
  photoUrl: 500,
  maxPriority: 1000,
} as const;

/**
 * Initials for the monogram tile.
 *
 * First and last name parts, matching the student monogram so the two read as
 * one design rather than two. A single-word name gives one letter — an Indian
 * institute has staff who go by one name, and doubling that letter would look
 * like a mistake.
 *
 * Never throws, on any input. A blank name is refused by the action and by a
 * CHECK constraint, but a rendering helper that can crash a page on unexpected
 * data is a rendering helper nobody can rely on.
 */
export function facultyInitials(name: unknown): string {
  if (typeof name !== 'string') return '';

  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) return '';

  const firstLetter = firstLetterOf(parts[0]);
  if (parts.length === 1) return firstLetter;

  return (firstLetter + firstLetterOf(parts[parts.length - 1])).toUpperCase();
}

/**
 * The first CHARACTER, not the first code unit.
 *
 * `name[0]` splits a surrogate pair, so a name beginning with an emoji or a
 * character outside the basic plane would render as half a symbol. Iterating
 * takes whole characters. Devanagari names are the ordinary case here and are
 * handled correctly either way, but the cost of being right is one line.
 */
function firstLetterOf(part: string | undefined): string {
  if (!part) return '';
  for (const character of part) return character.toUpperCase();
  return '';
}
