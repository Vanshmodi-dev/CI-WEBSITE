-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'ENROLLED', 'CLOSED', 'SPAM');

-- CreateEnum
CREATE TYPE "ClassLevel" AS ENUM ('CLASS_11', 'CLASS_12', 'CA_FOUNDATION', 'CA_INTERMEDIATE', 'CMA', 'OTHER');

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
    "ipHash" CHAR(64),

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
    "consentResult" BOOLEAN NOT NULL DEFAULT false,
    "consentName" BOOLEAN NOT NULL DEFAULT false,
    "consentPhoto" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "importRef" VARCHAR(64),

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
    "consentStory" BOOLEAN NOT NULL DEFAULT false,
    "consentName" BOOLEAN NOT NULL DEFAULT false,
    "consentPhoto" BOOLEAN NOT NULL DEFAULT false,
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

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sessionsValidFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "firstFailedLoginAt" TIMESTAMP(3),

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorLabel" VARCHAR(80) NOT NULL,
    "filename" VARCHAR(160) NOT NULL,
    "planDigest" CHAR(64) NOT NULL,
    "rowsTotal" INTEGER NOT NULL,
    "rowsCreated" INTEGER NOT NULL,
    "rowsUpdated" INTEGER NOT NULL,
    "rowsRejected" INTEGER NOT NULL,
    "madePublic" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorLabel" VARCHAR(80) NOT NULL,
    "action" VARCHAR(30) NOT NULL,
    "entity" VARCHAR(40) NOT NULL,
    "entityId" VARCHAR(40) NOT NULL,
    "summary" VARCHAR(200),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enquiries_ipHash_createdAt_idx" ON "enquiries"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "enquiries_status_createdAt_idx" ON "enquiries"("status", "createdAt");

-- CreateIndex
CREATE INDEX "enquiries_phone_createdAt_idx" ON "enquiries"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "toppers_importRef_key" ON "toppers"("importRef");

-- CreateIndex
CREATE INDEX "toppers_published_year_idx" ON "toppers"("published", "year");

-- CreateIndex
CREATE INDEX "toppers_programme_year_idx" ON "toppers"("programme", "year");

-- CreateIndex
CREATE INDEX "subject_scores_topperId_idx" ON "subject_scores"("topperId");

-- CreateIndex
CREATE UNIQUE INDEX "student_stories_slug_key" ON "student_stories"("slug");

-- CreateIndex
CREATE INDEX "student_stories_published_year_idx" ON "student_stories"("published", "year");

-- CreateIndex
CREATE INDEX "announcements_published_startsAt_endsAt_idx" ON "announcements"("published", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "batches_courseSlug_published_startsAt_idx" ON "batches"("courseSlug", "published", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "import_runs_at_idx" ON "import_runs"("at");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_entity_entityId_idx" ON "audit_log"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "subject_scores" ADD CONSTRAINT "subject_scores_topperId_fkey" FOREIGN KEY ("topperId") REFERENCES "toppers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- =============================================================================
-- EVERYTHING BELOW THIS LINE IS HAND-WRITTEN. PRISMA WILL NOT REGENERATE IT.
--
-- KEEP THIS FILE PURE ASCII. The local PostgreSQL runs a WIN1252 client
-- encoding, and one warning glyph in a comment aborted the LAST statement in
-- this file with SQLSTATE 22P05 -- so the audit-action constraint silently did
-- not exist. Comments in a migration are not decoration; they are executed.
-- =============================================================================
--
-- Phase 12 consolidated the two previous migrations into this one, because the
-- database has never been deployed and a DROP TABLE for a table that never held
-- a row is not history worth keeping.
--
-- Regenerating cost all 28 CHECK constraints, and the loss was SILENT: the
-- schema reported "in sync", every model was correct, and the last line of
-- defence for the consent model had simply evaporated. Prisma cannot express a
-- CHECK in schema.prisma, so it does not know these exist and cannot put them
-- back.
--
-- IF YOU EVER REGENERATE THIS MIGRATION, RE-APPEND THIS BLOCK.
-- `npm run verify:constraints` fails loudly if you forget. That is what caught
-- it here.
--
-- The seven `result_records` constraints from the original file are gone with
-- the table they protected. The remaining 21 are unchanged.
-- =============================================================================
-- CONSENT AND INTEGRITY CONSTRAINTS
-- -----------------------------------------------------------------------------
-- Written by hand: Prisma cannot express CHECK constraints in schema.prisma.
--
-- Why this matters: application logic can be bypassed by a direct query, a
-- data-fix script, or a future admin bug. These cannot.
--
-- Every consent column is BOOLEAN NOT NULL DEFAULT false, so none of these can
-- evaluate to NULL. A PostgreSQL CHECK only rejects FALSE and passes on NULL,
-- which is what made the previous nullable-enum constraints quietly permissive
-- (docs/PHASE-4.5-DB-VERIFICATION.md, Finding 3). That class of hole is now
-- closed by the column types themselves.
-- =============================================================================

-- ---- toppers ----------------------------------------------------------------

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_published_requires_consent"
  CHECK (NOT "published" OR ("consentRef" IS NOT NULL AND "consentResult"));

-- A photograph needs its OWN permission. Nothing else grants it.
ALTER TABLE "toppers" ADD CONSTRAINT "toppers_photo_requires_photo_consent"
  CHECK (NOT "published" OR "photoUrl" IS NULL OR "consentPhoto");

-- Showing anything other than initials needs name permission.
ALTER TABLE "toppers" ADD CONSTRAINT "toppers_name_requires_name_consent"
  CHECK (NOT "published" OR "displayNameMode" = 'INITIALS' OR "consentName");

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_published_at_set"
  CHECK (NOT "published" OR "publishedAt" IS NOT NULL);

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_year_sane"
  CHECK ("year" BETWEEN 2000 AND 2100);

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_score_sane"
  CHECK ("score" >= 0 AND "score" <= 9999);

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_score_unit_known"
  CHECK ("scoreUnit" IN ('percent', 'marks'));

ALTER TABLE "toppers" ADD CONSTRAINT "toppers_percent_range"
  CHECK ("scoreUnit" <> 'percent' OR "score" <= 100);

-- ---- subject_scores ---------------------------------------------------------

ALTER TABLE "subject_scores" ADD CONSTRAINT "subject_scores_score_sane"
  CHECK ("score" >= 0 AND "score" <= 9999);

-- ---- student_stories --------------------------------------------------------

-- A story is its own grant. Publishing one never implies a photograph.
ALTER TABLE "student_stories" ADD CONSTRAINT "student_stories_published_requires_consent"
  CHECK (NOT "published" OR ("consentRef" IS NOT NULL AND "consentStory"));

ALTER TABLE "student_stories" ADD CONSTRAINT "student_stories_photo_requires_photo_consent"
  CHECK (NOT "published" OR "photoUrl" IS NULL OR "consentPhoto");

ALTER TABLE "student_stories" ADD CONSTRAINT "student_stories_name_requires_name_consent"
  CHECK (NOT "published" OR "displayNameMode" = 'INITIALS' OR "consentName");

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

-- ---- admin ------------------------------------------------------------------

-- Guards against a plaintext password ever being written into the hash column.
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_password_is_hashed"
  CHECK ("passwordHash" LIKE 'scrypt$%');

ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_email_lowercase"
  CHECK ("email" = lower("email"));

-- THIS LIST MUST MATCH THE UNION IN `recordAudit` (src/lib/auth.ts).
--
-- Phase 10 added a 'signed_out' action and did not add it here. `recordAudit`
-- catches its own failures so an audit write can never roll back the thing the
-- admin actually did - which meant every sign-out entry was rejected by this
-- constraint and silently dropped, for the whole of Phase 10 and 11. The Phase
-- 10 report claims sign-out is audited. It was not.
--
-- tests/import.test.ts now asserts that every action in the TypeScript union
-- appears in this list, so the next one cannot drift the same way.
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_known"
  CHECK ("action" IN ('created', 'updated', 'published', 'unpublished',
                      'deleted', 'signed_in', 'signed_out', 'imported'));

