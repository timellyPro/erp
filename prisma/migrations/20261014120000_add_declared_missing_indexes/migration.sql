-- prisma/schema.prisma declares these 22 indexes, but the production database does not have them
-- (it was shaped outside the migration history), so queries by student/school/date on Payment,
-- Appointment, Homework, leave requests etc. lacked their supporting indexes.
-- Some earlier migrations create same-named indexes in a different (DESC) form on fresh databases,
-- so each statement is DROP IF EXISTS + CREATE: on production the drop is a no-op and the index is
-- created in the exact form the schema declares; on fresh databases the form is corrected.
-- Plain CREATE INDEX takes a short write lock per table; the tables are small, but run off-peak.
-- Deliberately NOT included: ParentSubscription_studentId_schoolId_periodEnd_idx (not in the schema)
-- and the legacy global unique indexes that production intentionally replaced with school-scoped ones.

DROP INDEX IF EXISTS "LeaveRequest_schoolId_status_fromDate_idx";
CREATE INDEX "LeaveRequest_schoolId_status_fromDate_idx" ON "LeaveRequest"("schoolId", "status", "fromDate");
DROP INDEX IF EXISTS "LeaveRequest_schoolId_teacherId_fromDate_idx";
CREATE INDEX "LeaveRequest_schoolId_teacherId_fromDate_idx" ON "LeaveRequest"("schoolId", "teacherId", "fromDate");
DROP INDEX IF EXISTS "Circular_schoolId_publishStatus_date_idx";
CREATE INDEX "Circular_schoolId_publishStatus_date_idx" ON "Circular"("schoolId", "publishStatus", "date");
DROP INDEX IF EXISTS "StudentLeaveRequest_schoolId_status_fromDate_idx";
CREATE INDEX "StudentLeaveRequest_schoolId_status_fromDate_idx" ON "StudentLeaveRequest"("schoolId", "status", "fromDate");
DROP INDEX IF EXISTS "StudentLeaveRequest_schoolId_studentId_fromDate_idx";
CREATE INDEX "StudentLeaveRequest_schoolId_studentId_fromDate_idx" ON "StudentLeaveRequest"("schoolId", "studentId", "fromDate");
DROP INDEX IF EXISTS "ExamTerm_schoolId_classId_createdAt_idx";
CREATE INDEX "ExamTerm_schoolId_classId_createdAt_idx" ON "ExamTerm"("schoolId", "classId", "createdAt");
DROP INDEX IF EXISTS "Student_schoolId_createdAt_idx";
CREATE INDEX "Student_schoolId_createdAt_idx" ON "Student"("schoolId", "createdAt");
DROP INDEX IF EXISTS "Mark_studentId_createdAt_idx";
CREATE INDEX "Mark_studentId_createdAt_idx" ON "Mark"("studentId", "createdAt");
DROP INDEX IF EXISTS "Event_schoolId_createdAt_idx";
CREATE INDEX "Event_schoolId_createdAt_idx" ON "Event"("schoolId", "createdAt");
DROP INDEX IF EXISTS "NewsFeed_schoolId_createdAt_idx";
CREATE INDEX "NewsFeed_schoolId_createdAt_idx" ON "NewsFeed"("schoolId", "createdAt");
DROP INDEX IF EXISTS "Homework_classId_dueDate_idx";
CREATE INDEX "Homework_classId_dueDate_idx" ON "Homework"("classId", "dueDate");
DROP INDEX IF EXISTS "Homework_schoolId_classId_dueDate_idx";
CREATE INDEX "Homework_schoolId_classId_dueDate_idx" ON "Homework"("schoolId", "classId", "dueDate");
DROP INDEX IF EXISTS "Homework_schoolId_classId_createdAt_idx";
CREATE INDEX "Homework_schoolId_classId_createdAt_idx" ON "Homework"("schoolId", "classId", "createdAt");
DROP INDEX IF EXISTS "Certificate_studentId_issuedDate_idx";
CREATE INDEX "Certificate_studentId_issuedDate_idx" ON "Certificate"("studentId", "issuedDate");
DROP INDEX IF EXISTS "Appointment_studentId_createdAt_idx";
CREATE INDEX "Appointment_studentId_createdAt_idx" ON "Appointment"("studentId", "createdAt");
DROP INDEX IF EXISTS "Appointment_schoolId_status_requestedAt_idx";
CREATE INDEX "Appointment_schoolId_status_requestedAt_idx" ON "Appointment"("schoolId", "status", "requestedAt");
DROP INDEX IF EXISTS "Appointment_schoolId_teacherId_status_idx";
CREATE INDEX "Appointment_schoolId_teacherId_status_idx" ON "Appointment"("schoolId", "teacherId", "status");
DROP INDEX IF EXISTS "Appointment_schoolId_studentId_createdAt_idx";
CREATE INDEX "Appointment_schoolId_studentId_createdAt_idx" ON "Appointment"("schoolId", "studentId", "createdAt");
DROP INDEX IF EXISTS "Payment_studentId_createdAt_idx";
CREATE INDEX "Payment_studentId_createdAt_idx" ON "Payment"("studentId", "createdAt");
DROP INDEX IF EXISTS "Payment_studentId_status_createdAt_idx";
CREATE INDEX "Payment_studentId_status_createdAt_idx" ON "Payment"("studentId", "status", "createdAt");
DROP INDEX IF EXISTS "Payment_studentId_purpose_status_createdAt_idx";
CREATE INDEX "Payment_studentId_purpose_status_createdAt_idx" ON "Payment"("studentId", "purpose", "status", "createdAt");
DROP INDEX IF EXISTS "PaymentFeeAllocation_paymentId_allocationType_idx";
CREATE INDEX "PaymentFeeAllocation_paymentId_allocationType_idx" ON "PaymentFeeAllocation"("paymentId", "allocationType");

-- Schema-declared indexes that fresh databases also lacked. The two UNIQUE indexes already exist in
-- production (replacing the legacy global unique ones), so they are only created if absent, never dropped.
CREATE UNIQUE INDEX IF NOT EXISTS "Student_schoolId_aadhaarNo_key" ON "Student"("schoolId", "aadhaarNo");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentApplication_schoolId_aadharNo_key" ON "StudentApplication"("schoolId", "aadharNo");
DROP INDEX IF EXISTS "ExtraFee_schoolId_targetStudentId_targetType_idx";
CREATE INDEX "ExtraFee_schoolId_targetStudentId_targetType_idx" ON "ExtraFee"("schoolId", "targetStudentId", "targetType");
DROP INDEX IF EXISTS "ParentSubscription_studentId_schoolId_currentPeriodEnd_idx";
CREATE INDEX "ParentSubscription_studentId_schoolId_currentPeriodEnd_idx" ON "ParentSubscription"("studentId", "schoolId", "currentPeriodEnd");
DROP INDEX IF EXISTS "StudentLeaveRequest_studentId_fromDate_idx";
CREATE INDEX "StudentLeaveRequest_studentId_fromDate_idx" ON "StudentLeaveRequest"("studentId", "fromDate");
DROP INDEX IF EXISTS "TransferCertificate_studentId_createdAt_idx";
CREATE INDEX "TransferCertificate_studentId_createdAt_idx" ON "TransferCertificate"("studentId", "createdAt");
