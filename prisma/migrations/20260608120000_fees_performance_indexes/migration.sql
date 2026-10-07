-- Fees / student-details hot-path indexes (offline payment, breakdown, receipts)
-- Safe to re-run: all CREATE INDEX IF NOT EXISTS

-- Payments: list by student + filter SUCCESS/COMPLETED for allocation rollups
CREATE INDEX IF NOT EXISTS "Payment_studentId_status_createdAt_idx"
  ON "Payment" ("studentId", "status", "createdAt" DESC);

-- Allocations: groupBy per student (fee breakdown + offline payment)
CREATE INDEX IF NOT EXISTS "PaymentFeeAllocation_studentId_allocationType_heads_idx"
  ON "PaymentFeeAllocation" ("studentId", "allocationType", "headType", "componentIndex", "extraFeeId");

-- Allocations: receipt lines for recent payments
CREATE INDEX IF NOT EXISTS "PaymentFeeAllocation_paymentId_allocationType_head_idx"
  ON "PaymentFeeAllocation" ("paymentId", "allocationType", "headType");

-- Extra fees: parallel scope queries (SCHOOL / CLASS / SECTION / STUDENT)
CREATE INDEX IF NOT EXISTS "ExtraFee_schoolId_targetType_idx"
  ON "ExtraFee" ("schoolId", "targetType");

CREATE INDEX IF NOT EXISTS "ExtraFee_schoolId_targetClassId_targetType_idx"
  ON "ExtraFee" ("schoolId", "targetClassId", "targetType");

CREATE INDEX IF NOT EXISTS "ExtraFee_schoolId_class_section_type_idx"
  ON "ExtraFee" ("schoolId", "targetClassId", "targetSection", "targetType");

CREATE INDEX IF NOT EXISTS "ExtraFee_schoolId_targetStudentId_targetType_idx"
  ON "ExtraFee" ("schoolId", "targetStudentId", "targetType")
  WHERE "targetStudentId" IS NOT NULL;

-- Student list filtered by class within a school
CREATE INDEX IF NOT EXISTS "Student_schoolId_classId_idx"
  ON "Student" ("schoolId", "classId");

-- Attendance trends: recent rows per student
CREATE INDEX IF NOT EXISTS "Attendance_studentId_date_desc_idx"
  ON "Attendance" ("studentId", "date" DESC);

-- Run ANALYZE on the tables touched above
ANALYZE "Payment";
ANALYZE "PaymentFeeAllocation";
ANALYZE "ExtraFee";
ANALYZE "Student";
ANALYZE "Attendance";

-- Payment delete guard checks
CREATE INDEX IF NOT EXISTS "ParentSubscription_paymentId_idx"
  ON "ParentSubscription" ("paymentId");

CREATE INDEX IF NOT EXISTS "Refund_paymentId_status_idx"
  ON "Refund" ("paymentId", "status");
