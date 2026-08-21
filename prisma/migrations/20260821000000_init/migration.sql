-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'ENROLLED', 'CLOSED', 'SPAM');

-- CreateEnum
CREATE TYPE "ClassLevel" AS ENUM ('CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CMA', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('RESULT_ONLY', 'RESULT_PARTIAL_NAME', 'RESULT_FULL_NAME', 'RESULT_NAME_PHOTO', 'STORY');

-- CreateEnum
CREATE TYPE "DisplayNameMode" AS ENUM ('INITIALS', 'FIRST_NAME_ONLY', 'FULL');

-- CreateEnum
CREATE TYPE "Programme" AS ENUM ('CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CMA');

-- CreateEnum
CREATE TYPE "Board" AS ENUM ('CBSE', 'RBSE', 'ICAI', 'OTHER');

-- CreateTable
CREATE TABLE "enquiries" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(160),
    "classLevel" "ClassLevel" NOT NULL,
    "courseSlug" VARCHAR(64),
    "message" VARCHAR(2000),
    "sourcePage" VARCHAR(200) NOT NULL,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "notes" VARCHAR(2000),
    "consentAt" TIMESTAMP(3) NOT NULL,
    "ipHash" CHAR(64) NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toppers" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "studentName" VARCHAR(120) NOT NULL,
    "displayNameMode" "DisplayNameMode" NOT NULL DEFAULT 'INITIALS',
    "photoUrl" VARCHAR(500),
    "score" DECIMAL(6,2) NOT NULL,
    "scoreUnit" VARCHAR(16) NOT NULL,
    "programme" "Programme" NOT NULL,
    "board" "Board",
    "year" INTEGER NOT NULL,
    "highlight" VARCHAR(160),
    "consentRef" VARCHAR(200),
    "consentScope" "ConsentScope",
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "toppers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_scores" (
    "id" TEXT NOT NULL,
    "topperId" TEXT NOT NULL,
    "subject" VARCHAR(60) NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "subject_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_records" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "studentName" VARCHAR(120) NOT NULL,
    "displayNameMode" "DisplayNameMode" NOT NULL DEFAULT 'INITIALS',
    "score" DECIMAL(6,2) NOT NULL,
    "scoreUnit" VARCHAR(16) NOT NULL,
    "programme" "Programme" NOT NULL,
    "board" "Board",
    "year" INTEGER NOT NULL,
    "consentRef" VARCHAR(200),
    "consentScope" "ConsentScope",
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "result_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_stories" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "studentName" VARCHAR(120) NOT NULL,
    "displayNameMode" "DisplayNameMode" NOT NULL DEFAULT 'INITIALS',
    "photoUrl" VARCHAR(500),
    "programme" "Programme" NOT NULL,
    "year" INTEGER NOT NULL,
    "challenge" VARCHAR(2000) NOT NULL,
    "journey" VARCHAR(4000) NOT NULL,
    "outcome" VARCHAR(2000) NOT NULL,
    "quote" VARCHAR(600),
    "consentRef" VARCHAR(200),
    "consentScope" "ConsentScope",
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "student_stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "message" VARCHAR(300) NOT NULL,
    "href" VARCHAR(300),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "courseSlug" VARCHAR(64) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "mode" VARCHAR(60) NOT NULL,
    "seatsNote" VARCHAR(120),
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiries_ipHash_createdAt_idx" ON "enquiries"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "enquiries_status_createdAt_idx" ON "enquiries"("status", "createdAt");

-- CreateIndex
CREATE INDEX "enquiries_phone_createdAt_idx" ON "enquiries"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "toppers_published_year_idx" ON "toppers"("published", "year");

-- CreateIndex
CREATE INDEX "toppers_programme_year_idx" ON "toppers"("programme", "year");

-- CreateIndex
CREATE INDEX "subject_scores_topperId_idx" ON "subject_scores"("topperId");

-- CreateIndex
CREATE INDEX "result_records_published_year_idx" ON "result_records"("published", "year");

-- CreateIndex
CREATE INDEX "result_records_programme_year_published_idx" ON "result_records"("programme", "year", "published");

-- CreateIndex
CREATE UNIQUE INDEX "student_stories_slug_key" ON "student_stories"("slug");

-- CreateIndex
CREATE INDEX "student_stories_published_year_idx" ON "student_stories"("published", "year");

-- CreateIndex
CREATE INDEX "announcements_published_startsAt_endsAt_idx" ON "announcements"("published", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "batches_courseSlug_published_startsAt_idx" ON "batches"("courseSlug", "published", "startsAt");

-- AddForeignKey
ALTER TABLE "subject_scores" ADD CONSTRAINT "subject_scores_topperId_fkey" FOREIGN KEY ("topperId") REFERENCES "toppers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================================================
-- CONSENT AND INTEGRITY CONSTRAINTS
-- -----------------------------------------------------------------------------
-- Added by hand on top of the Prisma-generated DDL. Prisma cannot express CHECK
-- constraints in schema.prisma, but the guarantees below are the whole point of
-- docs/design/STUDENT-DATA-POLICY.md: an unconsented published row must be
-- IMPOSSIBLE, not merely discouraged by application code.
--
-- Application logic can be bypassed by a direct query, a migration script or a
-- future admin bug. These cannot.
-- =============================================================================

-- ---- toppers ----------------------------------------------------------------

-- A published record must point at a signed authorisation and name its scope.
ALTER TABLE "toppers" ADD CONSTRAINT "toppers_published_requires_consent"
  CHECK (NOT "published" OR ("consentRef" IS NOT NULL AND "consentScope" IS NOT NULL));

-- A photograph may only be published under the fullest grant.
ALTER TABLE "toppers" ADD CONSTRAINT "toppers_photo_requires_photo_consent"
  CHECK (NOT "published" OR "photoUrl" IS NULL OR "consentScope" = 'RESULT_NAME_PHOTO');

-- A full name may only be displayed when the grant covers a full name.
ALTER TABLE "toppers" ADD CONSTRAINT "toppers_full_name_requires_consent"
  CHECK (
    NOT "published"
    OR "displayNameMode" <> 'FULL'
    OR "consentScope" IN ('RESULT_FULL_NAME', 'RESULT_NAME_PHOTO')
  );

-- A partial name still needs at least a partial-name grant.
ALTER TABLE "toppers" ADD CONSTRAINT "toppers_partial_name_requires_consent"
  CHECK (
    NOT "published"
    OR "displayNameMode" = 'INITIALS'
    OR "consentScope" <> 'RESULT_ONLY'
  );

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_published_at_set"
  CHECK (NOT "published" OR "publishedAt" IS NOT NULL);

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_year_sane"
  CHECK ("year" BETWEEN 2000 AND 2100);

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_score_sane"
  CHECK ("score" >= 0 AND "score" <= 9999);

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_score_unit_known"
  CHECK ("scoreUnit" IN ('percent', 'marks'));

-- A percentage cannot exceed 100.
ALTER TABLE "toppers" ADD CONSTRAINT "toppers_percent_range"
  CHECK ("scoreUnit" <> 'percent' OR "score" <= 100);

-- ---- subject_scores ---------------------------------------------------------

ALTER TABLE "subject_scores" ADD CONSTRAINT "subject_scores_score_sane"
  CHECK ("score" >= 0 AND "score" <= 9999);

-- ---- result_records ---------------------------------------------------------

ALTER TABLE "result_records" ADD CONSTRAINT "result_records_published_requires_consent"
  CHECK (NOT "published" OR ("consentRef" IS NOT NULL AND "consentScope" IS NOT NULL));

ALTER TABLE "result_records" ADD CONSTRAINT "result_records_full_name_requires_consent"
  CHECK (
    NOT "published"
    OR "displayNameMode" <> 'FULL'
    OR "consentScope" IN ('RESULT_FULL_NAME', 'RESULT_NAME_PHOTO')
  );

ALTER TABLE "result_records" ADD CONSTRAINT "result_records_partial_name_requires_consent"
  CHECK (
    NOT "published"
    OR "displayNameMode" = 'INITIALS'
    OR "consentScope" <> 'RESULT_ONLY'
  );

ALTER TABLE "result_records" ADD CONSTRAINT "result_records_published_at_set"
  CHECK (NOT "published" OR "publishedAt" IS NOT NULL);

ALTER TABLE "result_records" ADD CONSTRAINT "result_records_year_sane"
  CHECK ("year" BETWEEN 2000 AND 2100);

ALTER TABLE "result_records" ADD CONSTRAINT "result_records_score_sane"
  CHECK ("score" >= 0 AND "score" <= 9999);

ALTER TABLE "result_records" ADD CONSTRAINT "result_records_score_unit_known"
  CHECK ("scoreUnit" IN ('percent', 'marks'));

ALTER TABLE "result_records" ADD CONSTRAINT "result_records_percent_range"
  CHECK ("scoreUnit" <> 'percent' OR "score" <= 100);

-- ---- student_stories --------------------------------------------------------

-- A story is a separate, explicit grant. Nothing else authorises publishing one.
ALTER TABLE "student_stories" ADD CONSTRAINT "student_stories_published_requires_story_consent"
  CHECK (NOT "published" OR ("consentRef" IS NOT NULL AND "consentScope" = 'STORY'));

ALTER TABLE "student_stories" ADD CONSTRAINT "student_stories_published_at_set"
  CHECK (NOT "published" OR "publishedAt" IS NOT NULL);

ALTER TABLE "student_stories" ADD CONSTRAINT "student_stories_year_sane"
  CHECK ("year" BETWEEN 2000 AND 2100);

-- ---- announcements ----------------------------------------------------------

-- The validity window is what stops a notice going stale. It must be a window.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_window_valid"
  CHECK ("endsAt" > "startsAt");

-- ---- enquiries --------------------------------------------------------------

-- ipHash is a hex-encoded HMAC-SHA256 digest. A raw IP address would not match
-- this pattern, so an accidental change to the hashing code fails loudly.
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_iphash_is_sha256_hex"
  CHECK ("ipHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_name_not_blank"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_phone_digits"
  CHECK ("phone" ~ '^[0-9]{10,15}$');
