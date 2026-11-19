-- "StudentFeeYearHistory": one fee summary row per student per academic year (June-May).
CREATE TABLE "StudentFeeYearHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearStartYear" INTEGER NOT NULL,
    "totalFee" DOUBLE PRECISION NOT NULL,
    "concession" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalFee" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentFeeYearHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentFeeYearHistory_studentId_academicYearStartYear_key" ON "StudentFeeYearHistory"("studentId", "academicYearStartYear");
CREATE INDEX "StudentFeeYearHistory_schoolId_academicYearStartYear_idx" ON "StudentFeeYearHistory"("schoolId", "academicYearStartYear");

ALTER TABLE "StudentFeeYearHistory" ADD CONSTRAINT "StudentFeeYearHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeYearHistory" ADD CONSTRAINT "StudentFeeYearHistory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation, same fail-closed policy as the other tenant tables (docs/SECURITY_REVIEW.md section 3).
ALTER TABLE "StudentFeeYearHistory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentFeeYearHistory"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));
