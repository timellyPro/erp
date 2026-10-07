-- Persist mother name entered in admission form.
ALTER TABLE "StudentApplication"
ADD COLUMN IF NOT EXISTS "motherName" TEXT;
