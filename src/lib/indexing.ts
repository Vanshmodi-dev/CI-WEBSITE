/**
 * Which URLs a search engine should keep, and which it should merely walk
 * through.
 *
 * This lives on its own, with no imports, for two reasons. It is a policy
 * decision rather than a Next.js detail, and being import-free makes it
 * directly unit-testable — the rest of `src/lib/seo.ts` reaches for path
 * aliases that Node's test runner cannot resolve.
 */

export type ListingIndexing = {
  /** Path (with query where appropriate) this view should canonicalise to. */
  canonical: string;
  /** Omitted when the page should simply inherit the sitewide policy. */
  robots?: { index: boolean; follow: boolean };
};

/**
 * Canonical and indexing policy for a filterable, paginated list page.
 *
 * THE PROBLEM THIS SOLVES. `/results` links to every year and every programme,
 * and each of those links to every page. Left alone that is a combinatorial set
 * of URLs serving reshuffled versions of the same records — the classic way a
 * small site hands a crawler thousands of near-duplicate pages and gets its
 * genuinely useful ones crowded out.
 *
 * THE THREE CASES, and why each is treated differently:
 *
 *   1. UNFILTERED, PAGE 1 — the real page. Self-canonical, and it inherits the
 *      sitewide robots policy rather than overriding it.
 *
 *   2. FILTERED (`?year=`, `?programme=`) — a navigation state, not a document.
 *      It contains no record that the unfiltered list does not already lead to,
 *      so it canonicalises to the bare path and carries `noindex, follow`.
 *      `follow` matters: the crawler should still walk through it to the
 *      records.
 *
 *   3. PAGINATED (`?page=2`…) — NOT a duplicate. Results and stories have no
 *      individual URLs of their own, so page 2 is the only place its records
 *      exist. Canonicalising it back to page 1 — the common reflex — would tell
 *      Google to ignore the only copy of that content. Each page is therefore
 *      self-canonical and indexable, which is also Google's stated guidance.
 *
 * A filtered AND paginated view is filtered first: the filter is the stronger
 * signal, and `/results?programme=CMA&page=3` is a slice of a slice.
 */
export function listingIndexing({
  path,
  filtered,
  page,
}: {
  path: string;
  filtered: boolean;
  page: number;
}): ListingIndexing {
  if (filtered) {
    return { canonical: path, robots: { index: false, follow: true } };
  }
  if (page > 1) {
    return { canonical: `${path}?page=${page}`, robots: { index: true, follow: true } };
  }
  return { canonical: path };
}
