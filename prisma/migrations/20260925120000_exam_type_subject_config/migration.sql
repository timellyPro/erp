-- Per exam type + subject max marks and subsections.
-- Existing ExamType and ExamTypeSection rows are not modified.

CREATE TABLE IF NOT EXISTS "ExamTypeSubject" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "maxMarks" DOUBLE PRECISION,
    "examTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamTypeSubject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExamTypeSubjectSection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxMarks" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "examTypeSubjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamTypeSubjectSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExamTypeSubject_examTypeId_idx" ON "ExamTypeSubject"("examTypeId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamTypeSubject_examTypeId_subject_key" ON "ExamTypeSubject"("examTypeId", "subject");

CREATE INDEX IF NOT EXISTS "ExamTypeSubjectSection_examTypeSubjectId_idx" ON "ExamTypeSubjectSection"("examTypeSubjectId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamTypeSubjectSection_examTypeSubjectId_name_key" ON "ExamTypeSubjectSection"("examTypeSubjectId", "name");

DO $$ BEGIN
 ALTER TABLE "ExamTypeSubject" ADD CONSTRAINT "ExamTypeSubject_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "ExamType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "ExamTypeSubjectSection" ADD CONSTRAINT "ExamTypeSubjectSection_examTypeSubjectId_fkey" FOREIGN KEY ("examTypeSubjectId") REFERENCES "ExamTypeSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
