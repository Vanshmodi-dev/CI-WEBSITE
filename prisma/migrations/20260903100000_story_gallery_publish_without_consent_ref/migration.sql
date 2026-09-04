-- =============================================================================
-- A STORY AND A GALLERY PHOTOGRAPH NO LONGER NEED A CONSENT-FORM REFERENCE.
-- =============================================================================
-- HAND-WRITTEN. PRISMA WILL NOT REGENERATE THIS. Read the banner in
-- 20260824124217_init/migration.sql before touching any CHECK constraint.
--
-- WHAT CHANGES, IN TWO SENTENCES: publishing a STORY now requires the story
-- permission and nothing else. Publishing a GALLERY photograph that shows
-- identifiable people now requires the photograph permission and nothing else.
-- Both previously also required a non-null "consentRef".
--
-- WHY. This is the same removal 20260902120000 made for results, extended to
-- the two features that still had it, at the owner's request. The field was
-- presented as an ordinary optional field on both forms while the publish panel
-- refused to publish without it. The application half is in
-- src/lib/student-display.ts and src/lib/gallery.ts.
--
-- WHAT DOES NOT CHANGE, AND THIS IS THE IMPORTANT PART:
--
--   * The COLUMNS stay, on both tables, with every value in them. They point at
--     signed permissions the institute holds for named children. The stories
--     export still carries the column so those records stay reachable.
--   * "consentStory" is still required to publish a story. A result grant has
--     never authorised a story and still does not.
--   * "consentPhoto" is still required to publish a gallery photograph showing
--     identifiable people. "showsPeople = false" is still the only way past it.
--   * "student_stories_photo_requires_photo_consent" is untouched. A published
--     story's photograph still requires photograph permission.
--   * "student_stories_name_requires_name_consent" is untouched. Anything
--     beyond initials still requires name permission.
--   * "student_stories_published_at_set" is untouched.
--   * "gallery_items_text_printable" is untouched, and it still mentions
--     "consentRef". That constraint is about control characters in stored text,
--     not about publishing, and the column is retained - so the clause still
--     protects the data that is still there.
--   * Every "toppers" constraint is untouched; results were done in Phase 23.
--
-- WHY THIS DROPS AND RE-ADDS. PostgreSQL cannot relax a CHECK in place. Each
-- constraint keeps its name, so CONSENT_CRITICAL_CONSTRAINTS and every test
-- naming it still apply, and Prisma runs the file in one transaction, so there
-- is no window in which either table is unprotected.
--
-- !! THIS FILE TRIPS P-MIG-04 ("no migration contains a destructive statement")
-- BY DESIGN, exactly as 20260902120000 does. It is recorded as a read-and-
-- approved exception in REVIEWED_DESTRUCTIVE_MIGRATIONS
-- (src/lib/deployment-contract.ts), which names this migration and BOTH
-- constraints below. Anything else destructive still blocks.
--
-- No row can be invalidated: both new predicates are strictly weaker than the
-- ones they replace, so every row that satisfied the old one satisfies the new.
-- Nothing is rewritten and nothing is deleted.
-- =============================================================================

-- ---- student_stories --------------------------------------------------------

ALTER TABLE "student_stories" DROP CONSTRAINT "student_stories_published_requires_consent";

ALTER TABLE "student_stories" ADD CONSTRAINT "student_stories_published_requires_consent"
  CHECK (NOT "published" OR "consentStory");

-- ---- gallery_items ----------------------------------------------------------

ALTER TABLE "gallery_items" DROP CONSTRAINT "gallery_items_published_requires_consent";

ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_published_requires_consent"
  CHECK (
    "published" = false
    OR "showsPeople" = false
    OR "consentPhoto" = true
  );
