-- Phase 16, Topic 9 -- curated YouTube videos.
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

CREATE TYPE "VideoSubject" AS ENUM (
    'ACCOUNTANCY',
    'BUSINESS_STUDIES',
    'ECONOMICS',
    'EXAM_PREPARATION',
    'OTHER'
);

CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "youtubeId" VARCHAR(16) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(400),
    "subject" "VideoSubject" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- The same video cannot be added twice and quietly appear twice on the page.
CREATE UNIQUE INDEX "videos_youtubeId_key" ON "videos"("youtubeId");

CREATE INDEX "videos_published_priority_idx" ON "videos"("published", "priority");
CREATE INDEX "videos_published_subject_idx" ON "videos"("published", "subject");

-- Hand-written CHECK constraints. Prisma cannot express these, so they live
-- here and ONLY here.

-- 1. THE CONSTRAINT THIS TABLE EXISTS FOR.
--
--    A YouTube video id is exactly eleven characters of [A-Za-z0-9_-]. Nothing
--    else is a video id: not a URL, not an iframe, not embed HTML, not a
--    javascript: string, not a path.
--
--    The save action parses a pasted URL and extracts the id, and this is the
--    backstop for every other writer - a direct query, a future import, a
--    script somebody writes in a hurry. Phase 16 Topic 5 found the stories
--    action writing an unvalidated photo path for the whole of its existence
--    with nothing downstream compensating, which is exactly what a
--    database-level check is for.
--
--    Anchored at both ends, so a value that merely CONTAINS eleven valid
--    characters is refused.
ALTER TABLE "videos" ADD CONSTRAINT "videos_youtube_id_shape"
  CHECK ("youtubeId" ~ '^[A-Za-z0-9_-]{11}$');

-- 2. A blank title renders as an empty card on the public page. The action
--    refuses it; this refuses it for anybody else. `btrim` rather than <> ''
--    because "   " is blank to a reader.
ALTER TABLE "videos" ADD CONSTRAINT "videos_title_not_blank"
  CHECK (btrim("title") <> '');

-- 3. Ordering is a small integer, not an arbitrary one. A negative or enormous
--    priority is either a mistake or an attempt to pin one video ahead of
--    everything for ever; both are refused rather than stored.
ALTER TABLE "videos" ADD CONSTRAINT "videos_priority_sane"
  CHECK ("priority" BETWEEN 0 AND 1000);

-- 4. Free-text fields are shown to visitors. Control characters have no
--    legitimate source and render as invisible junk.
ALTER TABLE "videos" ADD CONSTRAINT "videos_text_printable"
  CHECK (
    "title" !~ '[\x00-\x1F\x7F]'
    AND ("description" IS NULL OR "description" !~ '[\x00-\x1F\x7F]')
  );
