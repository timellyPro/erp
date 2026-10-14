-- These columns are in prisma/schema.prisma and in the production database, but no earlier migration
-- adds them (they were applied outside the migration history, e.g. via `prisma db push`), so a
-- database built only from migrations lacked columns the app queries.
-- Idempotent: ADD COLUMN IF NOT EXISTS is a no-op on production, where they already exist.

ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "admissionFee" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "applicationFee" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "motherName" TEXT,
  ADD COLUMN IF NOT EXISTS "occupation" TEXT,
  ADD COLUMN IF NOT EXISTS "residencyType" TEXT DEFAULT 'Day Scholar';

ALTER TABLE "StudentApplication"
  ADD COLUMN IF NOT EXISTS "admissionFee" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "admissionFeePaid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "admissionFeePaidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "admissionFeePaymentMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "admissionFeePaymentMode" TEXT,
  ADD COLUMN IF NOT EXISTS "applicationFee" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "applicationFeePaid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "applicationFeePaidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "applicationFeePaymentMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "applicationFeePaymentMode" TEXT,
  ADD COLUMN IF NOT EXISTS "residencyType" TEXT NOT NULL DEFAULT 'Day Scholar';

CREATE INDEX IF NOT EXISTS "StudentApplication_residencyType_idx" ON "StudentApplication"("residencyType");
