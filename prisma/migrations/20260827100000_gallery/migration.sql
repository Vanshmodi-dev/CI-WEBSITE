-- Phase 16, Topic 8 -- the institute gallery.
--
-- PURE ASCII ONLY IN THIS FILE. A non-ASCII byte under a WIN1252 client
-- encoding aborts the statement that FOLLOWS it (SQLSTATE 22P05), so the error
-- points at the wrong line. No em dashes, no smart quotes.
--
-- ADDITIVE ONLY. One new enum and one new table; nothing existing is touched,
-- so every hand-written CHECK constraint in the earlier migrations is
-- undisturbed. Those constraints are invisible to schema.prisma and are
-- silently dropped if a migration is REGENERATED rather than added to
-- (Phase 12, P12-A). Add migrations. Never regenerate them.

CREATE TYPE "GalleryCategory" AS ENUM (
    'CLASSROOMS',
    'EVENTS',
    'STUDENTS',
    'ACHIEVEMENTS',
    'SEMINARS',
    'CELEBRATIONS'
);

CREATE TABLE "gallery_items" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "imageUrl" VARCHAR(500) NOT NULL,
    "alt" VARCHAR(200) NOT NULL,
    "caption" VARCHAR(300),
    "category" "GalleryCategory" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "showsPeople" BOOLEAN NOT NULL DEFAULT true,
    "consentRef" VARCHAR(200),
    "consentPhoto" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "gallery_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gallery_items_published_priority_idx"
  ON "gallery_items"("published", "priority");

CREATE INDEX "gallery_items_published_category_idx"
  ON "gallery_items"("published", "category");

-- Hand-written CHECK constraints. Prisma cannot express these, so they live
-- here and ONLY here.

-- 1. THE PRIVACY CONSTRAINT. This is the reason this table has constraints at
--    all, and it is the one that must never be relaxed.
--
--    docs/design/STUDENT-DATA-POLICY.md names gallery photographs in its scope
--    and sets the design position: "Assume publication is NOT authorised until
--    a specific record says otherwise." A published photograph that shows
--    people therefore needs BOTH the reference to the signed authorisation the
--    institute holds AND the photograph permission itself, which that document
--    says is "never implied by anything else".
--
--    `btrim(...) <> ''` rather than IS NOT NULL, because a consent reference of
--    three spaces is not a consent reference.
--
--    The save action refuses this case first, with a message a teacher can act
--    on. This constraint is the backstop for every other writer: a direct
--    query, a future import path, a script somebody writes in a hurry. Phase 16
--    Topic 5 found the stories action writing an unvalidated photo path for the
--    whole of its existence, which is exactly what a database-level backstop is
--    for.
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_published_requires_consent"
  CHECK (
    "published" = false
    OR "showsPeople" = false
    OR (
      "consentRef" IS NOT NULL
      AND btrim("consentRef") <> ''
      AND "consentPhoto" = true
    )
  );

-- 2. The photograph must be a path on this site, never an absolute URL and
--    never a traversal. MIRRORS `isSafePhotoPath()` in src/lib/validation.ts,
--    which is the gate the save action uses. A CHECK cannot express the full
--    predicate, so it enforces the properties that matter most.
--
--    NOT NULL as well: a gallery entry with no photograph is not a gallery
--    entry, and that is enforced by the column rather than only by the form.
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_image_is_site_relative"
  CHECK (
    "imageUrl" LIKE '/%'
    AND "imageUrl" NOT LIKE '//%'
    AND position('..' in "imageUrl") = 0
    AND position('\' in "imageUrl") = 0
    AND position(':' in "imageUrl") = 0
  );

-- 3. Alt text is what a screen-reader user gets INSTEAD of the photograph. A
--    blank one turns the gallery into a list of the word "image", so it is
--    refused here as well as in the form.
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_alt_not_blank"
  CHECK (btrim("alt") <> '');

-- 4. Ordering is a small integer, not an arbitrary one. A negative or enormous
--    priority is either a mistake or an attempt to pin one photograph ahead of
--    everything for ever; both are refused rather than stored.
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_priority_sane"
  CHECK ("priority" BETWEEN 0 AND 1000);

-- 5. Free-text fields are shown to visitors. Control characters have no
--    legitimate source and render as invisible junk. The caption allows tab and
--    newline (\x09, \x0A) no more than the other free-text columns do, matching
--    `faculty_text_printable`: alt is a single line, and so is a caption.
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_text_printable"
  CHECK (
    "alt" !~ '[\x00-\x1F\x7F]'
    AND ("caption" IS NULL OR "caption" !~ '[\x00-\x1F\x7F]')
    AND ("consentRef" IS NULL OR "consentRef" !~ '[\x00-\x1F\x7F]')
  );
