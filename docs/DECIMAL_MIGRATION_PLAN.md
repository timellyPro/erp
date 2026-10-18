# Money columns: Float to Decimal (plan, not started)

Money is stored as `Float` (double precision) in about 25 columns. Rounding noise has already caused visible
problems (`114677.570093458`, `11.5384615384615`). Stored fee totals are now whole rupees (Phase 3), but other
columns can still hold fractions: on the Demo School, 9 of 20 `PaymentFeeAllocation.allocatedAmount` rows were
not whole paise (prorated hostel installments such as 23,833.33).

## Decision (2026-10-18): not needed for now
Measured on the live Lotus school (821 fee rows): payments, amounts paid and payment allocations have no
float noise. The only non-2-decimal money values are `finalFee`/`remainingFee` on 9 students, each off by under
one rupee (the same 9 the reconcile dry run found), plus `discountPercent`, which is a derived percent. New
writes are whole rupees. That does not justify a change that touches every fee read and write. Revisit if the
precision report starts showing growth.

## Measure first
```bash
npx tsx scripts/money-precision-report.ts --school-id=<id>
```
Counts rows per column that are not 2-decimal and not whole rupees. If the live numbers are small and confined
to a few columns, targeted rounding may be enough and Decimal is not worth the risk.

## Why this is its own project
Prisma returns `Decimal` objects for Decimal columns, not `number`. Every place that reads a money column and
does arithmetic, compares, sums or formats it must change, across `lib/fees`, `app/api/**`, the exports, the PDFs
and the UI. Tests that build rows with plain numbers change with them. A mistake here shows up as a wrong
balance, so it must not be rushed or done in one step.

## Safe order (expand, then contract)
1. **Boundary helper.** `toMoney(x)` / `fromMoney(x)` in one module, used by new code, so conversion lives in
   one place. Money math in integer paise or a decimal library, never `number` arithmetic on rupees.
2. **One column family at a time**, smallest blast radius first: `FeeBulkEdit.amount` and
   `PaymentAuditLog` snapshots (new, few readers), then `ExtraFee.amount`, then `PaymentFeeAllocation`,
   `Payment.amount`, and last `StudentFee` (read by almost everything).
3. **Per family:** add a `numeric(14,2)` shadow column, write both columns, backfill in batches, compare with a
   script (`fee-integrity-report` style) until the difference is zero, switch reads to the new column, stop
   writing the old one, drop it in a later release.
4. **Each step ships alone**, behind a backup (see `docs/DB_MIGRATION.md` and the nightly backup workflow), tried first on the Demo School and then
   on a restored copy of Lotus before it touches live data.
5. **Never in the same release** as a change to fee rules.

## Not recommended
A single migration changing every column type at once, or a Prisma extension that silently converts back to
`number`. Both hide the places that need review.

## Related, smaller: store the discount in rupees
Per-head discounts are a rupee amount held implicitly as `totalFee - finalFee`. Recalculation now preserves them
(`storedFinalFee`, FEE_TOTALS.md section 10), so an explicit column is no longer needed to stop them being
overwritten. It would still make reports simpler; do it as part of step 2 above, not before.
