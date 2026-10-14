-- AlterTable
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "hiddenExamSubjects" TEXT[] DEFAULT ARRAY[]::TEXT[];
