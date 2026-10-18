# How a student's fee total is calculated, kept correct and repaired

Written after the fee-module review (Phases 0 to 3). It records how it works **today**, so the next
change starts from facts.

## 1. Where the numbers live

| What | Where | Used by |
|---|---|---|
| **Stored fee** | `StudentFee` (`totalFee` gross, `finalFee` after discount, `amountPaid`, `remainingFee`) | Fee Records list and its exports, fee cards, payments |
| **Student fee breakdown** | `computeAdminStudentFeeBreakdown` (per fee head, with discounts) | Student profile fee tab |
| **Due report / summary** | `feeDueReportCompute` (per head, class structure + extra fees) | Summary page cards, Fee Due Report Excel |

The stored fee is a **saved copy** that is rewritten whenever fees change
(`upsertStudentFeeFromStructure`, extra-fee add/edit/delete, class structure save, residency conversion,
payments). The other two recompute from the rows each time. A stored copy can go stale if some change
forgets to rewrite it, which is why section 4 exists.

**Gross total** = class fee structure + every extra fee that applies to the student.
**Final fee** = structure after the student's discount percent + extra fees at full face value
(`finalFeeFromStructureAndExtras`: the discount percent applies to the structure only).
**Remaining** = final fee minus amount paid (never below 0).

### Rounding
Stored totals are whole rupees (`roundRupee`), the same as the screens and `reconcileStudentFeeIntegrity`.
Before, a percentage discount stored values like `114677.570093458`. `discountPercent` itself is still
stored as a long fraction (for example `11.5384615384615`); storing the rupee discount instead is a
Phase 4 change because the final fee is derived from it.

### Known, intentional differences between the three views
- **Discounts.** The profile and the reports can place a discount against a specific fee head and cap it
  at that head's amount; the stored final fee applies the percent to the whole class structure. On the
  Demo School this made one student's discount 9,000 stored vs 5,000 in the reports.
- **School-wide fees** (Uniform Kit, Annual Day, ...). The Fee Due Report Excel used to leave these out, so
  its "Total fees" was short by exactly those fees. It now includes them by default
  (`?schoolWideExtras=0` restores the old layout).
- **Previous-year dues** are separated from current-year fees in the summary and the reports.

## 2. Hostel / day scholar conversion (as implemented)

`POST /api/student/:id/residency-conversion` (`lib/students/applyStudentResidencyConversion.ts`,
`lib/fees/residencyConversion.ts`).

- The academic year is **June to May (12 months)**; only whole months count, and the month you convert in
  counts as the **new** type. Converting on 7 Oct: 4 months as the old type (Jun to Sep), 8 as the new.
  The optional `convertedOn` (YYYY-MM-DD) body field lets you back-date it; it defaults to today.
- Fees are **prorated by months**: Hostel for the hosteller months, Mess for the day-scholar months,
  Transport for the day-scholar months of the chosen slab. Example: Hostel 71,500 a year with 4 hostel
  months is 23,833.33.
- Prorated rows are stored per student with `residencyConversion = true`. For a converted student the shared
  class/section/school Hostel, Mess and Transport rows are ignored; fees assigned directly to the student
  stay; previous-year dues are never touched.
- **Rows are updated in place by name** (so payments stay attached to the same fee row). A row the new plan
  drops is deleted only if it has no payments; if it has payments it is kept and billed only for what was
  paid. (Before, every conversion deleted and recreated the rows, stranding earlier payments.)
- **One transaction.** Fee rows, residency periods, the residency type and the recalculated stored fee
  commit together, and the recalculation reads the rows back inside the transaction. (Before, the
  recalculation ran after the commit, and a failure left a stale total.)
- Payments are never changed by a conversion.
- If the class has more than one transport slab, a conversion to Day Scholar must choose one
  (`TRANSPORT_REQUIRED`).
- **Transport added later** (the Assign Fee Heads screen) is billed at the full amount you enter. It is not
  prorated. If it should be, enter the prorated amount, or choose the slab during the conversion.

## 3. What changed in Phase 3
- Fee Due Report Excel includes school-wide fees by default.
- Stored totals are written as whole rupees.
- The conversion is one transaction and updates rows in place.
- `lib/fees/feeTotalsDrift.ts` and a weekly check (section 4).
- `scripts/repair-over-allocated-payment.ts` (section 5).
- Regression tests for assigning a split transport fee to a converted student.

## 4. Detecting drift

`scripts/fee-integrity-report.ts` compares every active student's stored fee with the fee structure, the
extra fees and the payments:

| Kind | Meaning |
|---|---|
| `grossTotal` | The stored total is not class structure + applicable extra fees (a fee head was added or changed without the total being updated) |
| `amountPaid` | The stored paid amount is not the sum of successful fee payments |
| `remaining` | The stored remaining is not final fee minus paid |

Differences under about one rupee are treated as rounding.

```bash
npx tsx scripts/fee-integrity-report.ts --details   # local, read-only: lists the students
npx tsx scripts/fee-integrity-report.ts --deep      # also runs the slower per-student breakdown check
```

It runs weekly in CI (`.github/workflows/fee-integrity.yml`, counts only because the logs are public) and
fails when more students drifted than the repo variable `FEE_INTEGRITY_MAX_CHANGED` (default 0). After a
known problem is repaired, lower the variable.

**Why this exists.** `scripts/reconcile-school-fees.ts --dry-run` only recomputes the total for students
with a discount or a long decimal. A student whose stored total is a clean but wrong number (for example a
missing transport fee) is never flagged by it. The Lotus dry run on 2026-10-18 therefore proved only that
11 students in that subset had drifted, not that the rest were fine. Use the integrity report for the full
picture.

**First full run on live data (2026-10-18, read-only):** 956 active students checked. Paid and remaining
were clean for everyone. The gross total had drifted for **7**: six at Lotus (of 717) and one test student
on the Demo School. Genius Best (233) was clean. The six at Lotus:

| Difference (expected minus stored) | Count | Reading |
|---|---|---|
| +39,600 | 3 | Class tuition missing from the stored total (clean numbers, so the old check could not see them) |
| +17,600.34 and +11,000.34 | 2 | The transport fee on the converted students; stored total never included it |
| -17,050 | 1 | Stored is higher by exactly one Mess installment |

Whether each is a mistake or intended (a waiver, a staff child) needs the school's answer.

## 5. Repairing

1. **Confirm with the school** what the student should owe. Take a backup first.
2. **A wrong gross total with clean numbers** (what the integrity report flags):
   `npx tsx scripts/recalculate-student-fees.ts --school-id=<id> --student-ids=<id1>,<id2>` (dry run), read
   before/after, then add `--apply`. It rewrites only `totalFee`, `finalFee` and `remainingFee` from the
   class structure and extra fees, never `amountPaid`, and blocks students with a discount unless
   `--allow-discount`. `reconcile-school-fees.ts` cannot fix these: it skips students without a discount or
   a long decimal.
   **A stale total with a discount or long decimals:** `npx tsx scripts/reconcile-school-fees.ts --dry-run
   --school-id=<id>`, read the before/after, then `--apply`. (It rewrites `totalFee`, `finalFee`,
   `amountPaid`, `remainingFee`; it never deletes payments or allocations.)
3. **A payment whose fee-head allocations add up to more than the payment**
   (compare each payment's allocations with its amount; query 6 in `scripts/db/phase0-fee-audit.sql`, which arrives with the stale-data PR):

   ```bash
   npx tsx scripts/repair-over-allocated-payment.ts --school-id=<id> --allocation-id=<id> --reason="School confirmed only 4,500 was paid toward mess"
   # review, then add --apply
   ```
   It removes only the surplus allocation, refuses if removing it would under-allocate the payment, and
   writes the change to the payment's history (Fees > Receipt Lookup & History).

## 6. Diagnosing one student whose total looks wrong

Run these (read-only) for the student and compare with the profile:

```sql
-- every extra fee that can apply to the student
SELECT e.name, e.amount, e."targetType", e."targetStudentId", e."residencyScope",
       e."residencyConversion", e."createdAt"
FROM "Student" st
JOIN "Class" c ON c.id = st."classId"
JOIN "ExtraFee" e ON e."schoolId" = st."schoolId"
WHERE st.id = '<student id>'
  AND (e."targetType" = 'SCHOOL'
       OR (e."targetType" = 'CLASS'   AND e."targetClassId" = st."classId")
       OR (e."targetType" = 'SECTION' AND e."targetClassId" = st."classId" AND e."targetSection" = c.section)
       OR (e."targetType" = 'STUDENT' AND e."targetStudentId" = st.id))
ORDER BY e."createdAt";

-- the class fee structure and the stored fee
SELECT components FROM "ClassFeeStructure" WHERE "classId" = (SELECT "classId" FROM "Student" WHERE id = '<student id>');
SELECT "totalFee", "finalFee", "discountPercent", "amountPaid", "remainingFee", "updatedAt"
FROM "StudentFee" WHERE "studentId" = '<student id>';
```

## 7. Still open
- **Why six Lotus students' stored totals are wrong** (three missing class tuition of 39,600, two missing a
  transport fee, one with an extra Mess installment). The assign path and the totals function were ruled out
  by test (`lib/fees/batchAssignStudentExtraFees.test.ts`). The rows from the diagnosing queries above would
  let the exact cause be reproduced offline. A student moved into a class after the fee was set up is one
  unconfirmed possibility for the missing tuition.
- **Whether those students should owe the difference.** Only the school can say; see the confirmation
  request. Repair with `scripts/recalculate-student-fees.ts` only after that.
- Per-head discount rules differ between the stored fee and the reports (section 1).
- The Summary page is computed from the due-report logic, not from stored totals, so it can still differ
  from the Fee Records list when discounts are assigned to specific heads.
- Float money columns and the unrounded `discountPercent` (Phase 4).
