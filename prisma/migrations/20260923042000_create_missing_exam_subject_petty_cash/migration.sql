-- ExamSubject and PettyCashExpense exist in the Prisma schema and in the production database
-- (created outside the migration history, e.g. via `prisma db push`), but no migration ever
-- created them. `prisma migrate deploy` on an empty database therefore failed at
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
