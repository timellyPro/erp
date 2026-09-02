-- Persist mother Aadhaar and email entered in admission form.
ALTER TABLE "StudentApplication"
ADD COLUMN IF NOT EXISTS "motherAadharNo" TEXT,
ADD COLUMN IF NOT EXISTS "motherEmail" TEXT;
