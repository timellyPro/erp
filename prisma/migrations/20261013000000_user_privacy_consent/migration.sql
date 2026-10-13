-- Records which version of the privacy policy a user (parents: on behalf of
-- their child) acknowledged, and when. Nullable: existing users are prompted
-- on next parent-portal visit.
ALTER TABLE "User" ADD COLUMN "privacyConsentVersion" TEXT;
ALTER TABLE "User" ADD COLUMN "privacyConsentAt" TIMESTAMP(3);
