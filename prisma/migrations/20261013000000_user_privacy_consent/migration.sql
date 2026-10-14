-- Records which version of the privacy policy a user (parents: on behalf of
-- their child) acknowledged, and when. Nullable: existing users are prompted
-- on next parent-portal visit.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "privacyConsentVersion" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "privacyConsentAt" TIMESTAMP(3);
-- IF NOT EXISTS added 2026-10-14: this migration had not been applied to production yet, and the
-- columns may already exist there (applied by hand); it must not fail a deploy in either case.
