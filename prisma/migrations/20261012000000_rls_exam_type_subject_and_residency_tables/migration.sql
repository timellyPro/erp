-- Tenant isolation (RLS) for the three tables added by the upstream merge after the
-- app_tenant role and policies were set up (docs/SECURITY_REVIEW.md section 3):
--   ExamTypeSubject, ExamTypeSubjectSection  (20260925120000_exam_type_subject_config)
--   StudentResidencyPeriod                   (20261001120000_student_residency_conversion)
--
-- app_tenant gets SELECT/INSERT/UPDATE/DELETE on every new table through the default
-- privileges set in 20260923104016_create_app_tenant_role. A table without RLS enabled is
-- therefore readable and writable across every school from a tenant-scoped connection, so
-- these must be locked down before any route reads them through app_tenant.
--
-- Same fail-closed behaviour as the existing policies: a connection that has not set
-- `app.current_school_id` sees no rows.

ALTER TABLE "ExamTypeSubject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExamTypeSubjectSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentResidencyPeriod" ENABLE ROW LEVEL SECURITY;

-- Direct "schoolId" column.
CREATE POLICY tenant_isolation ON "StudentResidencyPeriod"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));

-- 1 level: ExamTypeSubject -> ExamType.schoolId
CREATE POLICY tenant_isolation ON "ExamTypeSubject"
  USING (EXISTS (SELECT 1 FROM "ExamType" e WHERE e.id = "ExamTypeSubject"."examTypeId" AND e."schoolId" = current_setting('app.current_school_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "ExamType" e WHERE e.id = "ExamTypeSubject"."examTypeId" AND e."schoolId" = current_setting('app.current_school_id', true)));

-- 2 levels: ExamTypeSubjectSection -> ExamTypeSubject -> ExamType.schoolId
CREATE POLICY tenant_isolation ON "ExamTypeSubjectSection"
  USING (EXISTS (
    SELECT 1 FROM "ExamTypeSubject" s
    JOIN "ExamType" e ON e.id = s."examTypeId"
    WHERE s.id = "ExamTypeSubjectSection"."examTypeSubjectId"
      AND e."schoolId" = current_setting('app.current_school_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "ExamTypeSubject" s
    JOIN "ExamType" e ON e.id = s."examTypeId"
    WHERE s.id = "ExamTypeSubjectSection"."examTypeSubjectId"
      AND e."schoolId" = current_setting('app.current_school_id', true)
  ));
