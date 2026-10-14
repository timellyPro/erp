-- AlterTable
ALTER TABLE "ExamType" ADD COLUMN IF NOT EXISTS "maxMarks" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExamTermSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxMarks" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "termId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamTermSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MarkComponent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "totalMarks" DOUBLE PRECISION NOT NULL,
    "markId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkComponent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExamTermSection_termId_idx" ON "ExamTermSection"("termId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ExamTermSection_termId_name_key" ON "ExamTermSection"("termId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarkComponent_markId_idx" ON "MarkComponent"("markId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "MarkComponent_markId_name_key" ON "MarkComponent"("markId", "name");

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "ExamTermSection" ADD CONSTRAINT "ExamTermSection_termId_fkey" FOREIGN KEY ("termId") REFERENCES "ExamTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "MarkComponent" ADD CONSTRAINT "MarkComponent_markId_fkey" FOREIGN KEY ("markId") REFERENCES "Mark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
