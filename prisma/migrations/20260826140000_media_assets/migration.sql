-- Phase 16, Topic 5 -- uploaded images.
--
-- PURE ASCII ONLY IN THIS FILE. A non-ASCII byte under a WIN1252 client
-- encoding aborts the statement that FOLLOWS it (SQLSTATE 22P05), so the error
-- points at the wrong line. No em dashes, no smart quotes.
--
-- ADDITIVE ONLY. One new table; nothing existing is touched. The 21
-- hand-written CHECK constraints in 20260824124217_init are therefore
-- undisturbed. Those constraints are invisible to schema.prisma and are
-- silently dropped if a migration is ever REGENERATED rather than added to
-- (Phase 12, P12-A). Add migrations. Never regenerate them.

CREATE TABLE "media_assets" (
    "key" VARCHAR(40) NOT NULL,
    "contentType" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "originalName" VARCHAR(160) NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" VARCHAR(80) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "media_assets_uploadedAt_idx" ON "media_assets"("uploadedAt");

-- Hand-written CHECK constraints. Prisma cannot express these, so they live
-- here and ONLY here.
--
-- 1. The key is the shape this application issues, and nothing else. The same
--    pattern is asserted by `isMediaKey()` in src/lib/media/format.ts, which is
--    the gate the retrieval route uses. This is the backstop that still holds
--    if a future code path forgets to call it: a value that can only ever match
--    this pattern contains no separator, no dot-dot and no null byte, so it
--    cannot be used to address anything outside the store.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_key_shape"
  CHECK ("key" ~ '^[0-9a-f]{32}\.(jpg|png|webp|avif)$');

-- 2. Only the four formats the site will store. SVG is absent deliberately: it
--    is a document that can carry script, and it is refused by name in
--    `decideFormat` so that anyone who tries learns why.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_content_type_known"
  CHECK ("contentType" IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif'));

-- 3. Dimensions inside the range the ingest pipeline enforces. A row claiming
--    a 90000px image would mean the pipeline was bypassed.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_dimensions_sane"
  CHECK ("width" BETWEEN 1 AND 8000 AND "height" BETWEEN 1 AND 8000);

-- 4. A stored object has bytes, and is bounded well above what the re-encode
--    can produce (capped at 1920px on the long edge) while still refusing an
--    absurd row.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_bytes_sane"
  CHECK ("bytes" > 0 AND "bytes" <= 20971520);

-- 5. The original filename is a display label. Control characters in it would
--    render as invisible junk in the admin list and have no legitimate source.
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_name_printable"
  CHECK ("originalName" !~ '[\x00-\x1F\x7F]');
