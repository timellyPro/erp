-- Persist student status so Inactive doesn't reset to Active
ALTER TABLE "Student"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Active';
