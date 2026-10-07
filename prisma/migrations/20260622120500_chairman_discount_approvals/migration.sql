-- Add chairman role for school-level discount approvals.
ALTER TYPE "Role" ADD VALUE 'CHAIRMAN';

-- Persist discount approval requests before they are applied to StudentFee.
CREATE TYPE "DiscountApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "FeeDiscountApproval" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentFeeId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "status" "DiscountApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "totalFee" DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "discountFixedAmount" DOUBLE PRECISION,
    "finalFee" DOUBLE PRECISION NOT NULL,
    "discountFeeHeadKey" TEXT,
    "discountFeeHeadLabel" TEXT,
    "discountRemarks" TEXT,
    "reviewRemarks" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeeDiscountApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeeDiscountApproval_schoolId_status_createdAt_idx" ON "FeeDiscountApproval"("schoolId", "status", "createdAt");
CREATE INDEX "FeeDiscountApproval_studentId_idx" ON "FeeDiscountApproval"("studentId");
CREATE INDEX "FeeDiscountApproval_studentFeeId_idx" ON "FeeDiscountApproval"("studentFeeId");
CREATE INDEX "FeeDiscountApproval_requestedById_idx" ON "FeeDiscountApproval"("requestedById");
CREATE INDEX "FeeDiscountApproval_reviewedById_idx" ON "FeeDiscountApproval"("reviewedById");

ALTER TABLE "FeeDiscountApproval"
  ADD CONSTRAINT "FeeDiscountApproval_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeeDiscountApproval"
  ADD CONSTRAINT "FeeDiscountApproval_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeeDiscountApproval"
  ADD CONSTRAINT "FeeDiscountApproval_studentFeeId_fkey"
  FOREIGN KEY ("studentFeeId") REFERENCES "StudentFee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeeDiscountApproval"
  ADD CONSTRAINT "FeeDiscountApproval_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeeDiscountApproval"
  ADD CONSTRAINT "FeeDiscountApproval_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
