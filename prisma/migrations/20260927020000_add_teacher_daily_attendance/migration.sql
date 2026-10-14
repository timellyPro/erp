-- Formalizes TeacherDailyAttendance, which was previously created only via raw
-- DDL at request time (app/api/teacher/attendance/route.ts's ensureTable()) and
-- was invisible to `prisma migrate`/`prisma db pull` (PRODUCTION_READINESS.md's
-- schema-drift finding). Uses IF NOT EXISTS / exception-safe blocks throughout so
-- this migration is a no-op (not an error) in any environment where ensureTable()
-- already created the identical table/indexes/constraints at runtime.

CREATE TABLE IF NOT EXISTS "TeacherDailyAttendance" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherDailyAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeacherDailyAttendance_teacherId_date_key" ON "TeacherDailyAttendance"("teacherId", "date");

CREATE INDEX IF NOT EXISTS "TeacherDailyAttendance_schoolId_date_idx" ON "TeacherDailyAttendance"("schoolId", "date");

CREATE INDEX IF NOT EXISTS "TeacherDailyAttendance_teacherId_idx" ON "TeacherDailyAttendance"("teacherId");

DO $$
BEGIN
    ALTER TABLE "TeacherDailyAttendance" ADD CONSTRAINT "TeacherDailyAttendance_teacherId_fkey"
        FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "TeacherDailyAttendance" ADD CONSTRAINT "TeacherDailyAttendance_schoolId_fkey"
        FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
