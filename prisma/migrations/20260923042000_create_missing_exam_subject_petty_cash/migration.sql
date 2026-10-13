-- ExamSubject, PettyCashExpense, SystemSubscription and TeacherDailyAttendance are needed in the production database (the first two
-- also in the Prisma schema) and in the production database
-- (created outside the migration history, e.g. via `prisma db push`), but no migration ever
-- created them (SystemSubscription is a platform-level table that is not a Prisma model).
-- `prisma migrate deploy` on an empty database therefore failed at
-- 20260923042848_enable_rls_public_tables ("relation ExamSubject does not exist"), so a fresh
-- environment (staging, disaster recovery) could not be built from migrations.
--
-- Fully idempotent: on production, where both tables already exist, this migration is a no-op.
-- The timestamp sorts before 20260923042848 so fresh databases get the tables before RLS is enabled.

CREATE TABLE IF NOT EXISTS "ExamSubject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamSubject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PettyCashExpense" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "voucherNo" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "headOfAccount" TEXT,
    "paymentType" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "expenseDate" DATE NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExamSubject_schoolId_idx" ON "ExamSubject"("schoolId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExamSubject_schoolId_name_key" ON "ExamSubject"("schoolId", "name");
CREATE INDEX IF NOT EXISTS "PettyCashExpense_schoolId_idx" ON "PettyCashExpense"("schoolId");
CREATE INDEX IF NOT EXISTS "PettyCashExpense_expenseDate_idx" ON "PettyCashExpense"("expenseDate");
CREATE UNIQUE INDEX IF NOT EXISTS "PettyCashExpense_schoolId_voucherNo_key" ON "PettyCashExpense"("schoolId", "voucherNo");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExamSubject_schoolId_fkey') THEN
    ALTER TABLE "ExamSubject" ADD CONSTRAINT "ExamSubject_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PettyCashExpense_schoolId_fkey') THEN
    ALTER TABLE "PettyCashExpense" ADD CONSTRAINT "PettyCashExpense_schoolId_fkey"
      FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SystemSubscription" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "planName" TEXT,
    "expiresAt" TIMESTAMP(3),
    "renewalAmount" DOUBLE PRECISION,
    "billingUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SystemSubscription_expiresAt_idx" ON "SystemSubscription"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "SystemSubscription_provider_key" ON "SystemSubscription"("provider");
CREATE INDEX IF NOT EXISTS "SystemSubscription_status_idx" ON "SystemSubscription"("status");

-- TeacherDailyAttendance: dropped by 20260326101944_init and only recreated by
-- 20260927020000_add_teacher_daily_attendance, i.e. after enable_rls_public_tables needs it.
-- Same definition as that later migration (also idempotent), created early so RLS can be enabled.
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
