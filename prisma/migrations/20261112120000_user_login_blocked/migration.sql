-- A school admin can make a teacher inactive and also block their login (kept apart from the Active/Inactive label).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loginBlocked" BOOLEAN NOT NULL DEFAULT false;
