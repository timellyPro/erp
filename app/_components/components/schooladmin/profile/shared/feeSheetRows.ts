import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import {
  applyPendingDiscountsToDueRows,
  dueHeadRowsFromBreakdown,
  type DueHeadRow,
  type SheetDiscountApproval,
} from "@/lib/fees/feeBreakdownPaymentRows";
import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import { dueToPayInputString } from "./studentDetailHelpers";

/** Fees sheet rows for the current year, with pending (not yet accepted) discounts already applied. */
export function sheetRowsFromBreakdown(
  breakdown: AdminStudentFeeBreakdownResult | null | undefined,
  approvals: readonly SheetDiscountApproval[]
): DueHeadRow[] {
  return applyPendingDiscountsToDueRows(
    dueHeadRowsFromBreakdown(breakdown).filter((row) => !isPreviousYearFeeHeadName(row.label)),
    approvals
  );
}

/** Keep what the user already typed when fresh rows arrive, but never above the new balance. */
export function mergeSheetPayState(prev: DueHeadRow[], next: DueHeadRow[]): DueHeadRow[] {
  const prevByKey = new Map(prev.map((row) => [row.key, row]));
  return next.map((row) => {
    const old = prevByKey.get(row.key);
    if (!old) return row;
    if (old.payEntireHead) {
      return {
        ...row,
        payEntireHead: row.dueBefore > 0,
        payAmount: dueToPayInputString(row.dueBefore),
      };
    }
    const parsed = Number(old.payAmount);
    const payAmount =
      old.payAmount && Number.isFinite(parsed) && parsed > row.dueBefore + 0.01
        ? dueToPayInputString(row.dueBefore)
        : old.payAmount;
    return { ...row, payAmount, payEntireHead: false };
  });
}
