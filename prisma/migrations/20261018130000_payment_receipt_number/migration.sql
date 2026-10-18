-- Stable per-school receipt numbers.
--
-- "Payment"."receiptNo": 1, 2, 3... per school, assigned once when a fee payment succeeds and never
-- reused. "ReceiptCounter" holds the last number issued per school and is the only allocator.

ALTER TABLE "Payment" ADD COLUMN "receiptNo" INTEGER;
CREATE INDEX "Payment_receiptNo_idx" ON "Payment"("receiptNo");

CREATE TABLE "ReceiptCounter" (
    "schoolId" TEXT NOT NULL,
    "lastNo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("schoolId")
);

ALTER TABLE "ReceiptCounter" ADD CONSTRAINT "ReceiptCounter_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReceiptCounter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ReceiptCounter"
  USING ("schoolId" = current_setting('app.current_school_id', true))
  WITH CHECK ("schoolId" = current_setting('app.current_school_id', true));

-- Backfill: number every successful fee payment of each school in the order it happened.
WITH ranked AS (
  SELECT p.id,
         ROW_NUMBER() OVER (PARTITION BY s."schoolId" ORDER BY p."createdAt", p.id) AS rn
  FROM "Payment" p
  JOIN "Student" s ON s.id = p."studentId"
  WHERE p.status = 'SUCCESS' AND p.purpose = 'FEES' AND p."eventRegistrationId" IS NULL
)
UPDATE "Payment" p SET "receiptNo" = ranked.rn FROM ranked WHERE p.id = ranked.id;

INSERT INTO "ReceiptCounter" ("schoolId", "lastNo")
SELECT s."schoolId", MAX(p."receiptNo")
FROM "Payment" p
JOIN "Student" s ON s.id = p."studentId"
WHERE p."receiptNo" IS NOT NULL
GROUP BY s."schoolId";
