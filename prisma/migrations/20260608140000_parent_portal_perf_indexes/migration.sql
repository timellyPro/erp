-- Parent portal hot-path indexes (dashboard, analytics, homework, events, marks,
-- attendance, chat, leave, certificates, exams, subscription loaders)
-- Safe to re-run: all CREATE INDEX IF NOT EXISTS

-- ========== Event (workshops tab, dashboard, analytics) ==========
CREATE INDEX IF NOT EXISTS "Event_schoolId_idx"
  ON "Event" ("schoolId");

CREATE INDEX IF NOT EXISTS "Event_schoolId_createdAt_idx"
  ON "Event" ("schoolId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Event_schoolId_eventDate_idx"
  ON "Event" ("schoolId", "eventDate");

CREATE INDEX IF NOT EXISTS "Event_schoolId_classId_eventDate_idx"
  ON "Event" ("schoolId", "classId", "eventDate");

-- ========== Homework (homework tab, dashboard stats, analytics) ==========
CREATE INDEX IF NOT EXISTS "Homework_schoolId_classId_createdAt_idx"
  ON "Homework" ("schoolId", "classId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Homework_classId_dueDate_idx"
  ON "Homework" ("classId", "dueDate" DESC);

-- ========== Mark (marks tab, dashboard grade) ==========
CREATE INDEX IF NOT EXISTS "Mark_studentId_createdAt_desc_idx"
  ON "Mark" ("studentId", "createdAt" DESC);

-- ========== StudentLeaveRequest (leave tab) ==========
CREATE INDEX IF NOT EXISTS "StudentLeaveRequest_studentId_fromDate_idx"
  ON "StudentLeaveRequest" ("studentId", "fromDate" DESC);

-- ========== TransferCertificate (certificates tab) ==========
CREATE INDEX IF NOT EXISTS "TransferCertificate_studentId_createdAt_idx"
  ON "TransferCertificate" ("studentId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "TransferCertificate_schoolId_studentId_idx"
  ON "TransferCertificate" ("schoolId", "studentId");

-- ========== Appointment + ChatMessage (chat tab) ==========
CREATE INDEX IF NOT EXISTS "Appointment_studentId_createdAt_idx"
  ON "Appointment" ("studentId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Appointment_schoolId_studentId_createdAt_idx"
  ON "Appointment" ("schoolId", "studentId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ChatMessage_appointmentId_createdAt_idx"
  ON "ChatMessage" ("appointmentId", "createdAt");

-- ========== ExamTerm (exams & syllabus tab) ==========
CREATE INDEX IF NOT EXISTS "ExamTerm_schoolId_classId_createdAt_idx"
  ON "ExamTerm" ("schoolId", "classId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ExamTerm_schoolId_classId_status_idx"
  ON "ExamTerm" ("schoolId", "classId", "status");

-- ========== Class (approval authority, teacher resolution) ==========
CREATE INDEX IF NOT EXISTS "Class_schoolId_idx"
  ON "Class" ("schoolId");

CREATE INDEX IF NOT EXISTS "Class_teacherId_idx"
  ON "Class" ("teacherId");

CREATE INDEX IF NOT EXISTS "Class_schoolId_teacherId_idx"
  ON "Class" ("schoolId", "teacherId");

-- ========== ParentSubscription + Payment (subscription tab) ==========
CREATE INDEX IF NOT EXISTS "ParentSubscription_studentId_schoolId_periodEnd_idx"
  ON "ParentSubscription" ("studentId", "schoolId", "currentPeriodEnd" DESC);

CREATE INDEX IF NOT EXISTS "Payment_studentId_purpose_status_createdAt_idx"
  ON "Payment" ("studentId", "purpose", "status", "createdAt" DESC);

-- ========== EventRegistration (workshops registration batch lookup) ==========
CREATE INDEX IF NOT EXISTS "EventRegistration_studentId_eventId_idx"
  ON "EventRegistration" ("studentId", "eventId");

-- Refresh planner statistics for touched tables
ANALYZE "Event";
ANALYZE "Homework";
ANALYZE "Mark";
ANALYZE "StudentLeaveRequest";
ANALYZE "TransferCertificate";
ANALYZE "Appointment";
ANALYZE "ChatMessage";
ANALYZE "ExamTerm";
ANALYZE "Class";
ANALYZE "ParentSubscription";
ANALYZE "Payment";
ANALYZE "EventRegistration";
