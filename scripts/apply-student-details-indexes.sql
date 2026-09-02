-- Run in Supabase SQL editor if `prisma migrate deploy` cannot baseline this DB.
-- Speeds student-details tab: payments, fee allocations, marks, certificates.

CREATE INDEX IF NOT EXISTS "Payment_studentId_createdAt_idx"
  ON "Payment" ("studentId", "createdAt");

CREATE INDEX IF NOT EXISTS "PaymentFeeAllocation_paymentId_allocationType_idx"
  ON "PaymentFeeAllocation" ("paymentId", "allocationType");

CREATE INDEX IF NOT EXISTS "Mark_studentId_createdAt_idx"
  ON "Mark" ("studentId", "createdAt");

CREATE INDEX IF NOT EXISTS "Certificate_studentId_issuedDate_idx"
  ON "Certificate" ("studentId", "issuedDate");

CREATE INDEX IF NOT EXISTS "PaymentFeeAllocation_studentId_allocationType_idx"
  ON "PaymentFeeAllocation" ("studentId", "allocationType");
