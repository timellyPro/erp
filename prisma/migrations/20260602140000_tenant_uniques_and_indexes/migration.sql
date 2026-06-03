-- Tenant-scope uniqueness + tenant-first indexes
-- Generated manually for production safety.
-- Rollback strategy is documented at bottom of file.

-- =========================
-- 1) Drop global uniques
-- =========================

-- User.email (global unique) -> composite (schoolId, email)
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_email_key";

-- Student.admissionNumber (global unique) -> composite (schoolId, admissionNumber)
ALTER TABLE "Student" DROP CONSTRAINT IF EXISTS "Student_admissionNumber_key";

-- StudentApplication global uniques -> composite per school
ALTER TABLE "StudentApplication" DROP CONSTRAINT IF EXISTS "StudentApplication_applicationNo_key";
ALTER TABLE "StudentApplication" DROP CONSTRAINT IF EXISTS "StudentApplication_fedenaNo_key";
ALTER TABLE "StudentApplication" DROP CONSTRAINT IF EXISTS "StudentApplication_admissionNo_key";
ALTER TABLE "StudentApplication" DROP CONSTRAINT IF EXISTS "StudentApplication_parentAadharNo_key";

-- =========================
-- 2) Add composite uniques
-- =========================

CREATE UNIQUE INDEX IF NOT EXISTS "User_schoolId_email_key"
  ON "User" ("schoolId", "email");

-- Optional: keep superadmin/global users unique by email when schoolId IS NULL.
-- Uncomment if needed:
-- CREATE UNIQUE INDEX IF NOT EXISTS "User_email_null_school_unique"
--   ON "User" ("email") WHERE "schoolId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Student_schoolId_admissionNumber_key"
  ON "Student" ("schoolId", "admissionNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "StudentApplication_schoolId_applicationNo_key"
  ON "StudentApplication" ("schoolId", "applicationNo");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentApplication_schoolId_fedenaNo_key"
  ON "StudentApplication" ("schoolId", "fedenaNo");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentApplication_schoolId_admissionNo_key"
  ON "StudentApplication" ("schoolId", "admissionNo");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentApplication_schoolId_parentAadharNo_key"
  ON "StudentApplication" ("schoolId", "parentAadharNo");

-- =========================
-- 3) Tenant-first indexes
-- =========================

CREATE INDEX IF NOT EXISTS "Student_schoolId_createdAt_idx"
  ON "Student" ("schoolId", "createdAt");

CREATE INDEX IF NOT EXISTS "Circular_schoolId_publishStatus_date_idx"
  ON "Circular" ("schoolId", "publishStatus", "date");

CREATE INDEX IF NOT EXISTS "NewsFeed_schoolId_createdAt_idx"
  ON "NewsFeed" ("schoolId", "createdAt");

CREATE INDEX IF NOT EXISTS "LeaveRequest_schoolId_status_fromDate_idx"
  ON "LeaveRequest" ("schoolId", "status", "fromDate");
CREATE INDEX IF NOT EXISTS "LeaveRequest_schoolId_teacherId_fromDate_idx"
  ON "LeaveRequest" ("schoolId", "teacherId", "fromDate");

CREATE INDEX IF NOT EXISTS "StudentLeaveRequest_schoolId_status_fromDate_idx"
  ON "StudentLeaveRequest" ("schoolId", "status", "fromDate");
CREATE INDEX IF NOT EXISTS "StudentLeaveRequest_schoolId_studentId_fromDate_idx"
  ON "StudentLeaveRequest" ("schoolId", "studentId", "fromDate");

CREATE INDEX IF NOT EXISTS "Appointment_schoolId_status_requestedAt_idx"
  ON "Appointment" ("schoolId", "status", "requestedAt");
CREATE INDEX IF NOT EXISTS "Appointment_schoolId_teacherId_status_idx"
  ON "Appointment" ("schoolId", "teacherId", "status");

CREATE INDEX IF NOT EXISTS "Homework_schoolId_classId_dueDate_idx"
  ON "Homework" ("schoolId", "classId", "dueDate");

-- =========================
-- Rollback (manual)
-- =========================
-- 1) Drop the new composite indexes created above.
-- 2) Re-create the old global unique constraints:
--    - CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");
--    - CREATE UNIQUE INDEX "Student_admissionNumber_key" ON "Student" ("admissionNumber");
--    - CREATE UNIQUE INDEX "StudentApplication_applicationNo_key" ON "StudentApplication" ("applicationNo");
--      ... (and others)
-- NOTE: rollback is only safe if you guarantee no cross-school duplicates exist.

