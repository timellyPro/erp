-- Step 2 (second half) of real DB-level tenant isolation. See
-- docs/SECURITY_REVIEW.md and the two prior migrations
-- (20260923104016_create_app_tenant_role, 20260923104652_rls_policies_direct_schoolid_tables)
-- for full context.
--
-- Adds tenant_isolation policies to tables where "schoolId" is only
-- reachable transitively through a foreign key, using an EXISTS subquery
-- instead of a direct column comparison. Same current_setting(...,  true)
-- fail-closed behavior and same "inert until the app actually connects as
-- app_tenant" status as the previous two migrations - nothing here changes
-- current app behavior.
--
-- School is included directly (id = current_setting(...)) since the school
-- row itself IS the tenant, not a child of one.
--
-- Deliberately EXCLUDED, with reasons:
--   - Account, Session, VerificationToken (NextAuth/PrismaAdapter-managed):
--     these are read during login, before any tenant context can exist yet
--     (you need to read the session to find out who's authenticated at
--     all). Scoping them by schoolId risks breaking auth outright, and
--     they're identity infrastructure, not tenant business data. Left
--     entirely unscoped by RLS - same as today.
--   - PaymentWebhookEvent: no reliable foreign key to a schoolId-bearing
--     row exists (only external gateway order-id strings). Webhook
--     ingestion is a system-level entry point that runs before any
--     per-request tenant context is established, not a per-tenant user
--     request - out of scope for this table.

-- 1-level subquery: FK points directly at a table that already has a
-- tenant_isolation policy (from the direct-schoolId migration).
CREATE POLICY tenant_isolation ON "Payment"
  USING (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "Payment"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "Payment"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "PaymentFeeAllocation"
  USING (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "PaymentFeeAllocation"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "PaymentFeeAllocation"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "StudentFee"
  USING (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "StudentFee"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "StudentFee"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "Attendance"
  USING (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "Attendance"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "Attendance"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "Mark"
  USING (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "Mark"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "Mark"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "HomeworkSubmission"
  USING (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "HomeworkSubmission"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "HomeworkSubmission"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "EventRegistration"
  USING (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "EventRegistration"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Student" s WHERE s.id = "EventRegistration"."studentId" AND s."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "NewsFeedLike"
  USING (EXISTS (SELECT 1 FROM "NewsFeed" n WHERE n.id = "NewsFeedLike"."newsFeedId" AND n."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "NewsFeed" n WHERE n.id = "NewsFeedLike"."newsFeedId" AND n."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "Notification"
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "Notification"."userId" AND u."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "Notification"."userId" AND u."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "TeacherAuditRecord"
  USING (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "TeacherAuditRecord"."teacherId" AND u."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "User" u WHERE u.id = "TeacherAuditRecord"."teacherId" AND u."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "TimetableEntry"
  USING (EXISTS (SELECT 1 FROM "Timetable" t WHERE t.id = "TimetableEntry"."timetableId" AND t."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Timetable" t WHERE t.id = "TimetableEntry"."timetableId" AND t."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "ExamSchedule"
  USING (EXISTS (SELECT 1 FROM "ExamTerm" e WHERE e.id = "ExamSchedule"."termId" AND e."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "ExamTerm" e WHERE e.id = "ExamSchedule"."termId" AND e."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "ExamTermSection"
  USING (EXISTS (SELECT 1 FROM "ExamTerm" e WHERE e.id = "ExamTermSection"."termId" AND e."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "ExamTerm" e WHERE e.id = "ExamTermSection"."termId" AND e."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "ExamTypeSection"
  USING (EXISTS (SELECT 1 FROM "ExamType" e WHERE e.id = "ExamTypeSection"."examTypeId" AND e."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "ExamType" e WHERE e.id = "ExamTypeSection"."examTypeId" AND e."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "SyllabusTracking"
  USING (EXISTS (SELECT 1 FROM "ExamTerm" e WHERE e.id = "SyllabusTracking"."termId" AND e."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "ExamTerm" e WHERE e.id = "SyllabusTracking"."termId" AND e."schoolId" = current_setting('app.current_school_id', true)));

CREATE POLICY tenant_isolation ON "ChatMessage"
  USING (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "ChatMessage"."appointmentId" AND a."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "Appointment" a WHERE a.id = "ChatMessage"."appointmentId" AND a."schoolId" = current_setting('app.current_school_id', true)));

-- The tenant record itself.
CREATE POLICY tenant_isolation ON "School"
  USING ("id" = current_setting('app.current_school_id', true))
  WITH CHECK ("id" = current_setting('app.current_school_id', true));

-- 2-level subqueries: FK points at a table that ITSELF only reaches
-- schoolId transitively (handled above in this same migration).
CREATE POLICY tenant_isolation ON "MarkComponent"
  USING (EXISTS (
    SELECT 1 FROM "Mark" m
    JOIN "Student" s ON s.id = m."studentId"
    WHERE m.id = "MarkComponent"."markId" AND s."schoolId" = current_setting('app.current_school_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Mark" m
    JOIN "Student" s ON s.id = m."studentId"
    WHERE m.id = "MarkComponent"."markId" AND s."schoolId" = current_setting('app.current_school_id', true)
  ));

CREATE POLICY tenant_isolation ON "SyllabusUnit"
  USING (EXISTS (
    SELECT 1 FROM "SyllabusTracking" st
    JOIN "ExamTerm" e ON e.id = st."termId"
    WHERE st.id = "SyllabusUnit"."trackingId" AND e."schoolId" = current_setting('app.current_school_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "SyllabusTracking" st
    JOIN "ExamTerm" e ON e.id = st."termId"
    WHERE st.id = "SyllabusUnit"."trackingId" AND e."schoolId" = current_setting('app.current_school_id', true)
  ));

CREATE POLICY tenant_isolation ON "Refund"
  USING (EXISTS (
    SELECT 1 FROM "Payment" p
    JOIN "Student" s ON s.id = p."studentId"
    WHERE p.id = "Refund"."paymentId" AND s."schoolId" = current_setting('app.current_school_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Payment" p
    JOIN "Student" s ON s.id = p."studentId"
    WHERE p.id = "Refund"."paymentId" AND s."schoolId" = current_setting('app.current_school_id', true)
  ));
