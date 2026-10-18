-- "FeeAuditLog": append-only record of who created, edited or deleted an extra fee.
-- entityId is not a foreign key on purpose, so a deleted fee keeps its history.

CREATE TABLE "FeeAuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeeAuditLog_schoolId_createdAt_idx" ON "FeeAuditLog"("schoolId", "createdAt");
CREATE INDEX "FeeAuditLog_schoolId_entityType_entityId_createdAt_idx" ON "FeeAuditLog"("schoolId", "entityType", "entityId", "createdAt");

ALTER TABLE "FeeAuditLog" ADD CONSTRAINT "FeeAuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation, same fail-closed policy as the other tenant tables (docs/SECURITY_REVIEW.md section 3).
ALTER TABLE "FeeAuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "FeeAuditLog"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));

-- Append-only for the application role (same as "PaymentAuditLog").
REVOKE UPDATE, DELETE, TRUNCATE ON "FeeAuditLog" FROM app_tenant;
