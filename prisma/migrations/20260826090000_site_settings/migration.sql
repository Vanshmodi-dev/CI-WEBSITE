-- Phase 15 -- editable website copy.
--
-- PURE ASCII ONLY IN THIS FILE. A non-ASCII byte under a WIN1252 client
-- encoding aborts the statement that follows it (SQLSTATE 22P05), and the
-- failure surfaces on the NEXT statement, which sends you looking in the
-- wrong place. No em dashes, no smart quotes, no accents.
--
-- ADDITIVE ONLY. This migration creates one new table and touches nothing that
-- already exists, so it cannot disturb the 21 hand-written CHECK constraints in
-- 20260824124217_init. Those constraints are invisible to schema.prisma and are
-- silently dropped if a migration is ever REGENERATED rather than added to.
-- Add migrations; never regenerate them.

CREATE TABLE "site_settings" (
    "key" VARCHAR(64) NOT NULL,
    "value" VARCHAR(2000) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" VARCHAR(80),

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

-- Hand-written CHECK constraints. Prisma cannot express these in
-- schema.prisma, so they live here and ONLY here.
--
-- 1. The key charset is the same one asserted by `isEditableKey()` in
--    src/config/site-content.ts. The application allowlist is the real gate;
--    this is the backstop that holds if a future code path forgets to call it.
--    A value that can only ever match this pattern also cannot be used to
--    smuggle anything through a log line, a CSV export or a LIKE pattern.
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_key_charset"
  CHECK ("key" ~ '^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_-]+)+$');

-- 2. The longest field declared in the registry is 1200 characters. The column
--    is VARCHAR(2000) so a future field has room without a migration; this
--    constraint is the absolute ceiling, well under any figure at which a
--    single row could be used to bloat a page.
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_value_bounded"
  CHECK (char_length("value") <= 2000);

-- 3. Control characters other than newline have no legitimate place in website
--    copy and render as invisible junk. `cleanValue()` strips them on the way
--    in; this refuses them outright.
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_value_printable"
  CHECK ("value" !~ '[\x00-\x09\x0B-\x1F\x7F]');
