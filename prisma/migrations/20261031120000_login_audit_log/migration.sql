-- "LoginAuditLog": append-only record of every successful sign-in to a school's portals.
-- userId / studentId are not foreign keys on purpose, so a deleted account keeps its history.

CREATE TABLE "LoginAuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT,
    "role" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginAuditLog_schoolId_createdAt_idx" ON "LoginAuditLog"("schoolId", "createdAt");
CREATE INDEX "LoginAuditLog_schoolId_role_createdAt_idx" ON "LoginAuditLog"("schoolId", "role", "createdAt");
CREATE INDEX "LoginAuditLog_schoolId_userId_createdAt_idx" ON "LoginAuditLog"("schoolId", "userId", "createdAt");

ALTER TABLE "LoginAuditLog" ADD CONSTRAINT "LoginAuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation, same fail-closed policy as the other tenant tables (docs/SECURITY_REVIEW.md section 3).
-- Rows are written at sign-in by the owner connection (no tenant scope exists yet), read by the
-- school admin's audit tab through the app_tenant connection.
ALTER TABLE "LoginAuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LoginAuditLog"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));

-- Append-only for the application role (same as "PaymentAuditLog").
REVOKE UPDATE, DELETE, TRUNCATE ON "LoginAuditLog" FROM app_tenant;
