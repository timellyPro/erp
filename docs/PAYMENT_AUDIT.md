# Payment audit trail and receipt lookup

Answers two support questions: **"who changed or deleted this payment?"** and **"the parent has a
receipt, but I cannot see the payment"**.

## What is recorded

Table `PaymentAuditLog` (migration `20261018000000_payment_audit_log`). One row per event:

| `action` | When | Written by |
|---|---|---|
| `CREATE` | An offline payment is recorded; an online payment is first recorded on the customer's return | Staff member / verify route |
| `UPDATE` | Amount, reference, mode or date is edited; heads are added to an existing reference | Staff member |
| `DELETE` | A payment is deleted. `before` holds the full snapshot including the fee-head split | Staff member |
| `REFUND` | A refund is processed | School admin |
| `STATUS` | A gateway payment changes status (PENDING, SUCCESS, FAILED) | Webhook, verify route, reconcile cron (actor role `SYSTEM`) |
| `ALERT` | The gateway reports an amount different from the payment; the payment is left unchanged | Webhook |

Each row has the actor's id, name and role, a one-line `summary` (for example
`Amount 5000 -> 4500`), and `before` / `after` JSON snapshots.

Guarantees:

- **Same transaction.** The audit row is written inside the transaction that makes the change. If the
  audit row cannot be written, the payment change fails too. A financial change never commits unaudited.
- **Append-only for the app.** The `app_tenant` database role has `SELECT` and `INSERT` only. `UPDATE`,
  `DELETE` and `TRUNCATE` are revoked, so a bug in a route cannot rewrite history. (The owner role used by
  migrations and superadmin scripts can; treat direct edits as a break-glass action.)
- **Survives deletion.** `paymentId` is deliberately not a foreign key, so a deleted payment keeps its history.
- **Tenant-isolated.** Row-level security restricts every row to its school, like the other tenant tables.
- **No personal data in snapshots.** Ids, amounts, references and fee-head names only. No student name,
  phone or address, so the log does not conflict with de-identifying a student (`docs/DATA_RETENTION.md`).
- **History starts at deployment.** Payments created or changed before the migration have no history.

## Receipt lookup (school admin)

Fees, then **Receipt Lookup & History** (`/schooladmin/fees/receipt-lookup`, API
`GET /api/fees/receipt-lookup`). School admins only, because history shows staff names.

Search by any of: UTR / reference, payment id (full, start or end), student name, admission number,
collector name, amount (to the paisa), date range. Unlike the Transactions list it does **not** hide
payments by status, so `PENDING`, `FAILED` and refunded payments are shown. It also searches the audit
log, so a **deleted** payment is found with who deleted it, when, and what it covered.

Important: the "Receipt no" printed in day reports (1, 2, 3...) is only the row position in that one
report. It is not stored and changes between reports, so a receipt number a parent quotes from there cannot be
matched. Search by the UTR / reference instead. (Follow-up worth considering: a stable, per-school receipt
number stored on the payment.)

## Useful queries

Run as the database owner (SQL editor). Replace the school id.

```sql
-- Deleted payments in the last 30 days, newest first
SELECT "createdAt", "actorName", "actorRole", "summary", "paymentId", "studentId"
FROM "PaymentAuditLog"
WHERE "schoolId" = '<school id>' AND action = 'DELETE' AND "createdAt" > now() - interval '30 days'
ORDER BY "createdAt" DESC;

-- Everything one staff member changed
SELECT "createdAt", action, "summary", "paymentId"
FROM "PaymentAuditLog"
WHERE "schoolId" = '<school id>' AND "actorUserId" = '<user id>'
ORDER BY "createdAt" DESC LIMIT 200;

-- Payments edited after they were recorded (amount changes first)
SELECT "createdAt", "actorName", "summary", "paymentId"
FROM "PaymentAuditLog"
WHERE "schoolId" = '<school id>' AND action = 'UPDATE' AND "summary" LIKE 'Amount %'
ORDER BY "createdAt" DESC LIMIT 200;

-- Gateway amount mismatches waiting for a person (online payments only)
SELECT "createdAt", "paymentId", "summary"
FROM "PaymentAuditLog"
WHERE "schoolId" = '<school id>' AND action = 'ALERT'
ORDER BY "createdAt" DESC;
```

## Online payment webhook (`/api/payment/webhook`)

Hardened alongside this feature (online payments are not in use yet, so this protects you at launch):

- Only a duplicate **event id** is treated as "seen". Any other storage error returns `500` so the gateway
  retries. Before, every error was acknowledged and the event was lost.
- An event is marked `processedAt` once applied. A retry of an event that was stored but not applied (crash,
  deadlock) is applied on the retry; a fully processed duplicate is acknowledged. Applying a status is
  idempotent, so a replay cannot credit twice.
- A processing failure returns `500` and leaves the event unprocessed so the retry can apply it.
- If the gateway reports an amount different from ours, the payment is **not** credited. An `ALERT` row is
  written for a person to resolve.
- Status changes are written to the payment's history, attributed to the gateway.

## Retention

Keep audit rows as long as payment records (8 years, `docs/DATA_RETENTION.md`). Rows are removed with the
school (`ON DELETE CASCADE` on `schoolId`) and not otherwise.
