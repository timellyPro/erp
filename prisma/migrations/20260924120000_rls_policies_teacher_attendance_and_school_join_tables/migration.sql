-- Found by scripts/verify-rls-isolation.ts: these three tables have RLS ENABLED but NO policy, so the
-- app_tenant role sees zero rows in them (and every write is denied). Code that now runs inside a
-- tenant scope reads them:
--   * "TeacherDailyAttendance" - teacher/attendance GET and POST (raw SQL) would return an empty
--     list and fail to save.
--   * "_SchoolAdmin" / "_SchoolTeacher" - Prisma's implicit many-to-many join tables behind
--     School.admins / School.teachers, used by relation filters (`admins: { some: ... }`) and
--     includes (marks/report-card and marks/consolidated read `school.admins[].photoUrl`); with no
--     policy those relations come back empty.
--
-- Same fail-closed pattern as the earlier migrations: a connection with no
-- `app.current_school_id` sees nothing. Like them, this only affects the app_tenant role - the
-- owner role used by the normal Prisma client still bypasses RLS.
--
-- Join-table columns: "A" = School.id, "B" = User.id (implicit m2m, models in alphabetical order;
-- verified against live data).
--
-- Deliberately still WITHOUT a policy (by design, see docs/SECURITY_REVIEW.md 3): Account, Session,
-- VerificationToken (auth runs before a tenant exists), PaymentWebhookEvent (gateway callbacks have
-- no tenant), SystemSubscription (platform-level, superadmin only).

CREATE POLICY tenant_isolation ON "TeacherDailyAttendance"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));

CREATE POLICY tenant_isolation ON "_SchoolAdmin"
  USING ("A" = current_setting('app.current_school_id', true))
  WITH CHECK ("A" = current_setting('app.current_school_id', true));

CREATE POLICY tenant_isolation ON "_SchoolTeacher"
  USING ("A" = current_setting('app.current_school_id', true))
  WITH CHECK ("A" = current_setting('app.current_school_id', true));
