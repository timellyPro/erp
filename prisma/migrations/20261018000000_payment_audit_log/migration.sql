-- Payment audit trail + webhook retry safety.
--
-- 1. "PaymentAuditLog": append-only record of who created, edited, deleted or refunded a payment.
--    paymentId is not a foreign key on purpose, so a deleted payment keeps its history.
-- 2. "PaymentWebhookEvent"."processedAt": lets a retried gateway event be processed again if the
--    first attempt stored the event but failed before applying it.

CREATE TABLE "PaymentAuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentAuditLog_schoolId_createdAt_idx" ON "PaymentAuditLog"("schoolId", "createdAt");
CREATE INDEX "PaymentAuditLog_schoolId_paymentId_createdAt_idx" ON "PaymentAuditLog"("schoolId", "paymentId", "createdAt");
CREATE INDEX "PaymentAuditLog_schoolId_studentId_createdAt_idx" ON "PaymentAuditLog"("schoolId", "studentId", "createdAt");

ALTER TABLE "PaymentAuditLog" ADD CONSTRAINT "PaymentAuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation, same fail-closed policy as the other tenant tables: a connection that has not
-- set app.current_school_id sees no rows (docs/SECURITY_REVIEW.md section 3).
ALTER TABLE "PaymentAuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentAuditLog"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));

-- Append-only for the application role. The default privileges from
-- 20260923104016_create_app_tenant_role grant SELECT/INSERT/UPDATE/DELETE on every new table;
-- take UPDATE and DELETE back so a bug or a compromised route cannot rewrite or erase history.
-- (The owner role used by migrations and the cron/superadmin routes is unaffected.)
REVOKE UPDATE, DELETE, TRUNCATE ON "PaymentAuditLog" FROM app_tenant;

ALTER TABLE "PaymentWebhookEvent" ADD COLUMN "processedAt" TIMESTAMP(3);
-- Events stored before this column existed were already acknowledged: treat them as processed.
UPDATE "PaymentWebhookEvent" SET "processedAt" = "receivedAt" WHERE "processedAt" IS NULL;
