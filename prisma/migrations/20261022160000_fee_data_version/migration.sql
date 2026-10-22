-- A per-school counter bumped on every fee change, so cached copies of fee details can detect they are stale.
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "feeDataVersion" INTEGER NOT NULL DEFAULT 0;
