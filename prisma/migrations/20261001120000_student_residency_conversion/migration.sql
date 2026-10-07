-- Per-student hostel / day scholar stretches, and the prorated fee rows they create.
ALTER TABLE "ExtraFee" ADD COLUMN "residencyConversion" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StudentResidencyPeriod" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "academicYearStartYear" INTEGER NOT NULL,
    "residencyType" TEXT NOT NULL,
    "startedOn" DATE NOT NULL,
    "endedOn" DATE,
    "months" INTEGER NOT NULL,
    "transportKey" TEXT,
    "transportLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentResidencyPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentResidencyPeriod_studentId_academicYearStartYear_idx" ON "StudentResidencyPeriod"("studentId", "academicYearStartYear");
CREATE INDEX "StudentResidencyPeriod_schoolId_academicYearStartYear_idx" ON "StudentResidencyPeriod"("schoolId", "academicYearStartYear");

ALTER TABLE "StudentResidencyPeriod" ADD CONSTRAINT "StudentResidencyPeriod_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentResidencyPeriod" ADD CONSTRAINT "StudentResidencyPeriod_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
