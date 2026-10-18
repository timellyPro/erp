-- "FeeBulkEdit": one bulk "set a fee head's amount" run, kept so the whole run can be undone.

CREATE TABLE "FeeBulkEdit" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "headName" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "actorUserId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "changes" JSONB NOT NULL,
    "studentCount" INTEGER NOT NULL,
    "totalDelta" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneByName" TEXT,

    CONSTRAINT "FeeBulkEdit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeeBulkEdit_schoolId_createdAt_idx" ON "FeeBulkEdit"("schoolId", "createdAt");

ALTER TABLE "FeeBulkEdit" ADD CONSTRAINT "FeeBulkEdit_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeeBulkEdit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeeBulkEdit"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
