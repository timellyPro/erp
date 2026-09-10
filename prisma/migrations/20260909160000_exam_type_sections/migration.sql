CREATE TABLE IF NOT EXISTS "ExamTypeSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxMarks" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "examTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamTypeSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExamTypeSection_examTypeId_idx" ON "ExamTypeSection"("examTypeId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamTypeSection_examTypeId_name_key" ON "ExamTypeSection"("examTypeId", "name");

DO $$ BEGIN
 ALTER TABLE "ExamTypeSection" ADD CONSTRAINT "ExamTypeSection_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
