import { roundRupee } from "@/lib/formatRupee";
import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";

/** Sum of pre-discount face values across all fee heads. */
export function grossTotalFromBreakdown(
  breakdown: AdminStudentFeeBreakdownResult | null | undefined
): number | null {
  const heads = breakdown?.dueHeads;
  if (!heads?.length) return null;
  return roundRupee(heads.reduce((s, h) => s + (Number(h.grossAmount) || 0), 0));
}

/** Net total after per-head / overall discounts (matches Total Fees on profile). */
export function netTotalFromBreakdown(
  breakdown: AdminStudentFeeBreakdownResult | null | undefined
): number | null {
  if (breakdown == null) return null;
  const fromField = Number(breakdown.totalAmount);
  if (Number.isFinite(fromField) && fromField > 0) return roundRupee(fromField);
  const heads = breakdown.dueHeads;
  if (!heads?.length) return null;
  return roundRupee(heads.reduce((s, h) => s + (Number(h.snapshotAmount) || 0), 0));
}
