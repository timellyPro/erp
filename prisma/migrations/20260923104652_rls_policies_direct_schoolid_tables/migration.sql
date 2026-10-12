-- Step 2 (first half) of real DB-level tenant isolation. See
-- docs/SECURITY_REVIEW.md and prisma/migrations/20260923104016_create_app_tenant_role
-- for full context.
--
-- Adds an actual tenant-isolation policy to every table that has a DIRECT
-- "schoolId" column. Tables where schoolId is only reachable transitively
-- (Payment, StudentFee, Attendance, Mark, etc. - via studentId -> Student.
-- schoolId) are NOT covered here; they need a subquery-based policy, which
-- is a separate design decision and a separate migration.
--
-- This is still inert on its own: RLS policies only restrict non-owner,
-- non-BYPASSRLS roles, and the app's Prisma connection still uses the
-- owning role, which bypasses RLS regardless of any policy here. The
-- app_tenant role created in the previous migration has no code path that
-- connects as it yet, and no `app.current_school_id` session variable is
-- ever set today - so this migration changes nothing about current app
-- behavior. It's being added now, ahead of the connection-role switch,
-- specifically because it's safe to verify independently while it's still
-- consequence-free.
--
-- current_setting('app.current_school_id', true) - the `true` (missing_ok)
-- means an app_tenant connection that hasn't run `SET LOCAL
-- app.current_school_id = '<id>'` yet sees the setting as NULL, and every
-- policy below evaluates to NULL (not true) for that comparison - i.e. it
-- fails CLOSED (no rows visible/writable), not open. That's the safe
-- default for a connection that forgot to set tenant context.
--
-- User and BackupEmailSchedule have a NULLABLE schoolId (global/superadmin-
-- scoped rows, e.g. a SUPERADMIN user or a global backup schedule entry).
-- Those rows are correctly invisible to a school-scoped app_tenant
-- connection under this policy - superadmin routes are out of scope for
-- app_tenant and need their own carve-out (a separate role or a policy
-- branch), not covered by this migration.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'User', 'LeaveRequest', 'BackupEmailSchedule', 'SchoolSettings', 'Circular',
    'StudentLeaveRequest', 'Class', 'Timetable', 'ExamTerm', 'Student', 'ExamType',
    'ExamSubject', 'Event', 'NewsFeed', 'Homework', 'CertificateTemplate', 'Certificate',
    'TransferCertificate', 'StudentHistory', 'Appointment', 'FeeDiscountApproval',
    'ClassFeeStructure', 'ExtraFee', 'ExtraFeeHeadTemplate', 'PettyCashExpense',
    'ParentSubscription', 'StudentApplication'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("schoolId" = current_setting(''app.current_school_id'', true))
         WITH CHECK ("schoolId" = current_setting(''app.current_school_id'', true))',
      t
    );
  END LOOP;
END
$$;
