-- Phase 0 fee audit: READ-ONLY. Every statement is a SELECT.
-- Run each numbered query separately in the Supabase SQL editor (use the owner/postgres
-- connection, not app_tenant, so RLS does not hide rows). Paste the results back; do not
-- "fix" anything from here. Repairs come later, per school, with a dry run first.
--
-- "Paid" mirrors lib/fees/reconcileStudentFeeFromPayments.ts: purpose = 'FEES',
-- eventRegistrationId IS NULL, status IN ('SUCCESS','COMPLETED').
-- Tolerance is 0.01 rupee because money columns are Float.

-- ---------------------------------------------------------------------------
-- 0. Scale check: how big is each table (so you know what "a few rows" means)
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM "School")                AS schools,
  (SELECT count(*) FROM "Student")               AS students,
  (SELECT count(*) FROM "StudentFee")            AS student_fees,
  (SELECT count(*) FROM "Payment")               AS payments,
  (SELECT count(*) FROM "PaymentFeeAllocation")  AS allocations,
  (SELECT count(*) FROM "PaymentWebhookEvent")   AS webhook_events;

-- ---------------------------------------------------------------------------
-- 1. Stored amountPaid vs sum of successful fee payments  (issue 1.1, 4.1)
-- ---------------------------------------------------------------------------
SELECT s."schoolId", sf."studentId", sf."amountPaid" AS stored_paid,
       COALESCE(p.paid, 0) AS payments_paid,
       round((sf."amountPaid" - COALESCE(p.paid, 0))::numeric, 2) AS diff
FROM "StudentFee" sf
JOIN "Student" s ON s.id = sf."studentId"
LEFT JOIN (
  SELECT "studentId", sum(amount) AS paid
  FROM "Payment"
  WHERE purpose = 'FEES' AND "eventRegistrationId" IS NULL
    AND status IN ('SUCCESS', 'COMPLETED')
  GROUP BY "studentId"
) p ON p."studentId" = sf."studentId"
WHERE abs(sf."amountPaid" - COALESCE(p.paid, 0)) > 0.01
ORDER BY abs(sf."amountPaid" - COALESCE(p.paid, 0)) DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 2. remainingFee should equal max(0, finalFee - amountPaid)  (issue 1.1)
-- ---------------------------------------------------------------------------
SELECT s."schoolId", sf."studentId", sf."finalFee", sf."amountPaid", sf."remainingFee",
       round((GREATEST(0, sf."finalFee" - sf."amountPaid") - sf."remainingFee")::numeric, 2) AS diff
FROM "StudentFee" sf
JOIN "Student" s ON s.id = sf."studentId"
WHERE abs(GREATEST(0, sf."finalFee" - sf."amountPaid") - sf."remainingFee") > 0.01
ORDER BY abs(GREATEST(0, sf."finalFee" - sf."amountPaid") - sf."remainingFee") DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 3. Negative or impossible stored values  (issue 1.1)
-- ---------------------------------------------------------------------------
SELECT s."schoolId", sf."studentId", sf."totalFee", sf."discountPercent", sf."finalFee",
       sf."amountPaid", sf."remainingFee"
FROM "StudentFee" sf
JOIN "Student" s ON s.id = sf."studentId"
WHERE sf."remainingFee" < 0 OR sf."finalFee" < 0 OR sf."totalFee" < 0
   OR sf."finalFee" > sf."totalFee" + 0.01
   OR sf."discountPercent" < 0 OR sf."discountPercent" > 100
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 4. Float noise: values with more than 2 decimal places  (issue 1.2)
--    Counts only. A non-zero count confirms the decimal-discount symptom is stored data.
-- ---------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE "discountPercent" <> round("discountPercent"::numeric, 2)::float8) AS discount_gt_2dp,
  count(*) FILTER (WHERE "totalFee"        <> round("totalFee"::numeric, 2)::float8)        AS total_gt_2dp,
  count(*) FILTER (WHERE "finalFee"        <> round("finalFee"::numeric, 2)::float8)        AS final_gt_2dp,
  count(*) FILTER (WHERE "remainingFee"    <> round("remainingFee"::numeric, 2)::float8)    AS remaining_gt_2dp
FROM "StudentFee";

-- Sample of the offending discount rows
SELECT s."schoolId", sf."studentId", sf."discountPercent", sf."totalFee", sf."finalFee"
FROM "StudentFee" sf
JOIN "Student" s ON s.id = sf."studentId"
WHERE sf."discountPercent" <> round(sf."discountPercent"::numeric, 2)::float8
LIMIT 50;

-- ---------------------------------------------------------------------------
-- 5. SUCCESS fee payments with NO allocation rows  (issue 4.1, 1.3)
-- ---------------------------------------------------------------------------
SELECT s."schoolId", p.id AS payment_id, p."studentId", p.amount, p.status,
       p."transactionId", p."createdAt"
FROM "Payment" p
JOIN "Student" s ON s.id = p."studentId"
WHERE p.purpose = 'FEES' AND p."eventRegistrationId" IS NULL
  AND p.status IN ('SUCCESS', 'COMPLETED')
  AND NOT EXISTS (SELECT 1 FROM "PaymentFeeAllocation" a WHERE a."paymentId" = p.id)
ORDER BY p."createdAt" DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 6. Allocation total != payment amount  (issue 1.3, 2.2)
--    PAYMENT rows add, REFUND rows subtract (see schema comment on allocatedAmount).
-- ---------------------------------------------------------------------------
SELECT s."schoolId", p.id AS payment_id, p."studentId", p.amount AS payment_amount,
       a.net_allocated, round((p.amount - a.net_allocated)::numeric, 2) AS diff
FROM "Payment" p
JOIN "Student" s ON s.id = p."studentId"
JOIN (
  SELECT "paymentId",
         sum(CASE WHEN "allocationType" = 'REFUND' THEN -"allocatedAmount" ELSE "allocatedAmount" END) AS net_allocated
  FROM "PaymentFeeAllocation"
  GROUP BY "paymentId"
) a ON a."paymentId" = p.id
WHERE p.purpose = 'FEES' AND p.status IN ('SUCCESS', 'COMPLETED')
  AND p."hyperpgRefunded" = false
  AND abs(p.amount - a.net_allocated) > 0.01
ORDER BY abs(p.amount - a.net_allocated) DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 7. Orphan allocations: EXTRA_FEE allocation whose ExtraFee row no longer exists
--    (issue 1.3: "payment missing against the extra fee after edit/split")
-- ---------------------------------------------------------------------------
SELECT s."schoolId", a.id AS allocation_id, a."paymentId", a."studentId",
       a."extraFeeId", a."componentName", a."allocatedAmount", a."createdAt"
FROM "PaymentFeeAllocation" a
JOIN "Student" s ON s.id = a."studentId"
LEFT JOIN "ExtraFee" e ON e.id = a."extraFeeId"
WHERE a."headType" = 'EXTRA_FEE' AND e.id IS NULL
ORDER BY a."createdAt" DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 8. Allocation name no longer matches current ExtraFee name  (issue 1.3 rename)
-- ---------------------------------------------------------------------------
SELECT s."schoolId", a."studentId", a."extraFeeId",
       a."componentName" AS name_on_allocation, e.name AS current_fee_name,
       a."allocatedAmount"
FROM "PaymentFeeAllocation" a
JOIN "ExtraFee" e ON e.id = a."extraFeeId"
JOIN "Student" s ON s.id = a."studentId"
WHERE a."headType" = 'EXTRA_FEE'
  AND a."componentName" IS NOT NULL
  AND lower(btrim(a."componentName")) <> lower(btrim(e.name))
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 9. PENDING fee payments older than 1 hour  (stuck gateway payments, issue 4.2)
-- ---------------------------------------------------------------------------
SELECT s."schoolId", p.id AS payment_id, p."studentId", p.amount, p.gateway,
       p."transactionId", p."hyperpgOrderId", p."hyperpgStatus", p."createdAt"
FROM "Payment" p
JOIN "Student" s ON s.id = p."studentId"
WHERE p.status = 'PENDING' AND p.purpose = 'FEES'
  AND p."createdAt" < now() - interval '1 hour'
ORDER BY p."createdAt" DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 10. Gateway says success but our row is not SUCCESS  (issue 4.2)
-- ---------------------------------------------------------------------------
SELECT s."schoolId", p.id AS payment_id, p."studentId", p.amount, p.status,
       p."hyperpgStatus", p."hyperpgStatusId", p."hyperpgLastUpdatedAt", p."createdAt"
FROM "Payment" p
JOIN "Student" s ON s.id = p."studentId"
WHERE p.gateway = 'HYPERPG' AND p.status NOT IN ('SUCCESS', 'COMPLETED')
  AND upper(coalesce(p."hyperpgStatus", '')) IN ('CHARGED', 'SUCCESS', 'COMPLETED')
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 11. Webhook events received that match NO payment  (issue 4.2)
--     The handler acks with 200 in this case, so the gateway never retries.
-- ---------------------------------------------------------------------------
SELECT w.id, w."eventName", w."orderId", w."hyperpgOrderId", w."receivedAt"
FROM "PaymentWebhookEvent" w
WHERE NOT EXISTS (
  SELECT 1 FROM "Payment" p
  WHERE (w."orderId" IS NOT NULL AND (p."transactionId" = w."orderId" OR p."hyperpgOrderId" = w."orderId"))
     OR (w."hyperpgOrderId" IS NOT NULL AND (p."transactionId" = w."hyperpgOrderId" OR p."hyperpgOrderId" = w."hyperpgOrderId"))
)
ORDER BY w."receivedAt" DESC
LIMIT 200;

-- ---------------------------------------------------------------------------
-- 12. Possible duplicate payments: same student + amount + reference  (issue 4.1)
-- ---------------------------------------------------------------------------
SELECT p."studentId", p.amount, p."transactionId", count(*) AS copies,
       min(p."createdAt") AS first_at, max(p."createdAt") AS last_at
FROM "Payment" p
WHERE p.purpose = 'FEES' AND p.status IN ('SUCCESS', 'COMPLETED')
  AND p."transactionId" IS NOT NULL AND btrim(p."transactionId") <> ''
GROUP BY p."studentId", p.amount, p."transactionId"
HAVING count(*) > 1
LIMIT 100;

-- ---------------------------------------------------------------------------
-- 13. Re-run of the two dormant checks recorded earlier (2026-09-24)
--     13a: legacy BASE:-1 allocations (feeDueReportCompute drops them)
-- ---------------------------------------------------------------------------
SELECT count(*) AS legacy_base_minus1_allocations
FROM "PaymentFeeAllocation"
WHERE "headType" = 'BASE_COMPONENT' AND "componentIndex" = -1;

--     13b: students with a lump extra fee AND both installment rows in one scope
SELECT e."schoolId", e."targetType", e."targetClassId", e."targetSection", e."targetStudentId",
       regexp_replace(e.name, '\s*\((1st|2nd)[^)]*\)\s*$', '', 'i') AS base_name,
       count(*) FILTER (WHERE e.name ~* '(1st|2nd)') AS installment_rows,
       count(*) FILTER (WHERE e.name !~* '(1st|2nd)') AS lump_rows
FROM "ExtraFee" e
GROUP BY 1, 2, 3, 4, 5, 6
HAVING count(*) FILTER (WHERE e.name ~* '(1st|2nd)') > 0
   AND count(*) FILTER (WHERE e.name !~* '(1st|2nd)') > 0
LIMIT 100;
-- (13b is a heuristic on the name format; the real check is in
--  lib/fees/studentTuitionFromStructure.ts. Treat any row as "look closer", not proof.)

-- ---------------------------------------------------------------------------
-- 14. Backup freshness proxy: newest rows per table (tells you what a restore must contain)
-- ---------------------------------------------------------------------------
SELECT (SELECT max("createdAt") FROM "Payment")        AS newest_payment,
       (SELECT max("updatedAt") FROM "StudentFee")     AS newest_fee_update,
       (SELECT max("receivedAt") FROM "PaymentWebhookEvent") AS newest_webhook;
