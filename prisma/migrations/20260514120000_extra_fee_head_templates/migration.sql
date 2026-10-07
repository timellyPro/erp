-- CreateTable
CREATE TABLE "ExtraFeeHeadTemplate" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtraFeeHeadTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExtraFeeHeadTemplate_schoolId_idx" ON "ExtraFeeHeadTemplate"("schoolId");

ALTER TABLE "ExtraFeeHeadTemplate" ADD CONSTRAINT "ExtraFeeHeadTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
