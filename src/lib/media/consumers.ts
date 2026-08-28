/**
 * WHERE A PHOTOGRAPH CAN BE USED — the list, and the words for it.
 *
 * Pure: no database, no `server-only`. That split is not tidiness. The
 * assertion that matters here reads `prisma/schema.prisma` and checks this list
 * against it, and a unit test runs in plain Node, where importing `server-only`
 * throws. The queries that USE this list live in `references.ts` alongside
 * Prisma; everything a test needs to reason about lives here.
 *
 * =============================================================================
 * WHY THIS FILE EXISTS — A DEFECT THAT COST A PUBLISHED PHOTOGRAPH
 * =============================================================================
 * Topic 5 built the photo library when exactly two things on this site could
 * carry a photograph: a student result and a student story. It counted usage in
 * the library page, and it refused deletion in the action, and both places
 * hand-wrote the same pair of queries.
 *
 * Topic 6 then gave teachers a photograph. Topic 8 gave gallery entries one —
 * and a gallery entry's `imageUrl` is NOT NULL, so it is the one photo on this
 * site that a record cannot survive losing. Neither topic went back to the two
 * hand-written pairs, and nothing failed, because a query that looks in the
 * wrong two tables is not an error. It is an answer.
 *
 * Phase 18 reproduced the consequence in a browser, from a clean database:
 *
 *   a photograph used by a PUBLISHED gallery entry and a PUBLISHED teacher
 *   → the library said "Not used anywhere"
 *   → it offered Delete
 *   → the server accepted
 *   → both records still pointed at it
 *   → a visitor asking for that photograph got 404
 *
 * Two clicks, from an ordinary admin screen, to a broken image on a live page
 * and bytes that cannot be recovered. The guard was not weak; it was looking in
 * half the places.
 *
 * So the list of places lives HERE, once, as data. The library page and the
 * delete action both read it, which is what makes them incapable of disagreeing
 * again — and `tests/media-references.test.ts` reads `prisma/schema.prisma` and
 * fails if a model grows a photo column that is not declared below. Adding a
 * fifth consumer is one line; forgetting to is a failing test rather than a
 * lost photograph.
 */

/**
 * One place a photograph can be referenced from.
 *
 * `column` is the field holding a site-relative `/media/<key>` path. `noun` is
 * what the admin is told, in the words the admin uses elsewhere — "teacher",
 * not "Faculty".
 */
export type MediaConsumer = {
  /** Prisma model name, and the key the schema test matches on. */
  model: 'topper' | 'studentStory' | 'faculty' | 'galleryItem';
  /** The column holding the path. */
  column: 'photoUrl' | 'imageUrl';
  /** Singular noun shown to an administrator. */
  noun: string;
  /** Plural noun shown to an administrator. */
  plural: string;
  /** Where the teacher goes to detach it. */
  href: string;
};

export const MEDIA_CONSUMERS: readonly MediaConsumer[] = [
  { model: 'topper', column: 'photoUrl', noun: 'student result', plural: 'student results', href: '/admin/students' },
  { model: 'studentStory', column: 'photoUrl', noun: 'student story', plural: 'student stories', href: '/admin/stories' },
  { model: 'faculty', column: 'photoUrl', noun: 'teacher', plural: 'teachers', href: '/admin/faculty' },
  { model: 'galleryItem', column: 'imageUrl', noun: 'gallery photo', plural: 'gallery photos', href: '/admin/gallery' },
];

/** How many records of each kind point at one path. */
export type MediaUsage = {
  total: number;
  /** Only the consumers with a non-zero count, in declaration order. */
  parts: ReadonlyArray<{ consumer: MediaConsumer; count: number }>;
};

/**
 * "2 teachers and 1 gallery photo" — the refusal, in the admin's own words.
 *
 * The previous message said "still used by N records", which tells a teacher a
 * number and not a single thing about where to go next. Naming the kinds is the
 * difference between a refusal and an instruction.
 */
export function describeUsage(usage: MediaUsage): string {
  const phrases = usage.parts.map(
    ({ consumer, count }) => `${count} ${count === 1 ? consumer.noun : consumer.plural}`,
  );
  const last = phrases.at(-1);
  if (last === undefined) return 'nothing';
  if (phrases.length === 1) return last;
  return `${phrases.slice(0, -1).join(', ')} and ${last}`;
}
