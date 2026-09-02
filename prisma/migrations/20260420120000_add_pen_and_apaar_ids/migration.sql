-- Add optional student identity fields used across admission and student creation.
ALTER TABLE "Student"
ADD COLUMN "penNumber" TEXT,
ADD COLUMN "apaarId" TEXT;

ALTER TABLE "StudentApplication"
ADD COLUMN "penNumber" TEXT,
ADD COLUMN "apaarId" TEXT;
