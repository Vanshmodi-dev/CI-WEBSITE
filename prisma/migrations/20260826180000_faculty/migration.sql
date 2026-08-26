-- Phase 16, Topic 6 -- teaching staff.
--
-- PURE ASCII ONLY IN THIS FILE. A non-ASCII byte under a WIN1252 client
-- encoding aborts the statement that FOLLOWS it (SQLSTATE 22P05), so the error
-- points at the wrong line. No em dashes, no smart quotes.
--
-- ADDITIVE ONLY. One new table; nothing existing is touched, so the 21
-- hand-written CHECK constraints in 20260824124217_init are undisturbed. Those
-- are invisible to schema.prisma and are silently dropped if a migration is
-- REGENERATED rather than added to (Phase 12, P12-A). Add migrations. Never
-- regenerate them.

CREATE TABLE "faculty" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "designation" VARCHAR(120) NOT NULL,
    "subject" VARCHAR(120),
    "bio" VARCHAR(600),
    "photoUrl" VARCHAR(500),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "faculty_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "faculty_published_priority_idx" ON "faculty"("published", "priority");

-- Hand-written CHECK constraints. Prisma cannot express these, so they live
-- here and ONLY here.
--
-- 1 and 2. A card with a blank name or a blank designation renders as an empty
--    box on the public page. The action refuses both; these refuse them for any
--    other writer, including a direct query and a future import path.
--    `btrim` rather than <> '' because "   " is blank to a reader.
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_name_not_blank"
  CHECK (btrim("name") <> '');

ALTER TABLE "faculty" ADD CONSTRAINT "faculty_designation_not_blank"
  CHECK (btrim("designation") <> '');

-- 3. Ordering is a small integer, not an arbitrary one. A negative or enormous
--    priority is either a mistake or an attempt to make one record sort ahead
--    of everything for ever; both are refused rather than stored.
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_priority_sane"
  CHECK ("priority" BETWEEN 0 AND 1000);

-- 4. The photo must be a path on this site, never an absolute URL and never a
--    traversal. This MIRRORS `isSafePhotoPath()` in src/lib/validation.ts,
--    which is the gate the save action uses; a CHECK cannot express the full
--    predicate, so it enforces the three properties that matter most.
--
--    Phase 16 Topic 5 found the stories action writing this column with NO
--    validation at all for the whole of its existence. That is exactly the
--    class of defect a database-level backstop exists for: the application
--    check protects new writes by the path everyone remembers, and this one
--    holds when somebody adds a path nobody remembered.
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_photo_is_site_relative"
  CHECK (
    "photoUrl" IS NULL
    OR (
      "photoUrl" LIKE '/%'
      AND "photoUrl" NOT LIKE '//%'
      AND position('..' in "photoUrl") = 0
      AND position('\' in "photoUrl") = 0
    )
  );

-- 5. Free-text fields are shown to visitors. Control characters have no
--    legitimate source and render as invisible junk.
ALTER TABLE "faculty" ADD CONSTRAINT "faculty_text_printable"
  CHECK (
    "name" !~ '[\x00-\x1F\x7F]'
    AND "designation" !~ '[\x00-\x1F\x7F]'
    AND ("subject" IS NULL OR "subject" !~ '[\x00-\x1F\x7F]')
    AND ("bio" IS NULL OR "bio" !~ '[\x00-\x08\x0B-\x1F\x7F]')
  );
