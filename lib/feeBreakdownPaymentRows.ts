import { splitFeeHeadsForDisplay } from "@/lib/feeHeadInstallmentDisplay";
import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";

export type DueHeadRow = {
  key: string;
  sourceKey?: string;
  label: string;
  totalAmount: number;
  paidAmount: number;
  discountAmount: number;
  dueBefore: number;
  payAmount: string;
  payEntireHead: boolean;
  splitIntoTwoInstallments?: boolean;
};

export function dueHeadRowsFromBreakdown(
  breakdown: AdminStudentFeeBreakdownResult | null | undefined
): DueHeadRow[] {
  const dueHeads = Array.isArray(breakdown?.dueHeads) ? breakdown.dueHeads : [];
  const mappedRows = dueHeads.map((h) => {
    const snapshotAmount = Math.round((Number(h.snapshotAmount) || 0) * 100) / 100;
    const grossAmount = Math.round((Number(h.grossAmount ?? h.snapshotAmount) || 0) * 100) / 100;
    const dueBefore = Math.round((Number(h.dueBefore) || 0) * 100) / 100;
    return {
      key: h.key,
      label: h.label || "Fee Head",
      grossAmount,
      snapshotAmount,
      paidAmount: Math.max(snapshotAmount - dueBefore, 0),
      dueBefore,
      splitIntoTwoInstallments:
        h.headType === "EXTRA_FEE" ? Boolean(h.splitIntoTwoInstallments) : undefined,
    };
  });

  return splitFeeHeadsForDisplay(
    mappedRows.map((r) => ({
      key: r.key,
      label: r.label,
      amount: r.snapshotAmount,
      gross: r.grossAmount,
      paid: r.paidAmount,
      due: r.dueBefore,
      splitIntoTwoInstallments: r.splitIntoTwoInstallments,
    }))
  ).map((h) => {
    const gross = Math.round((Number(h.gross ?? h.amount) || 0) * 100) / 100;
    const net = Math.round((Number(h.amount) || 0) * 100) / 100;
    return {
      key: h.key,
      sourceKey: h.sourceKey,
      label: h.label,
      totalAmount: gross,
      paidAmount: Math.round((Number(h.paid) || 0) * 100) / 100,
      discountAmount: Math.max(0, Math.round((gross - net) * 100) / 100),
      dueBefore: Math.round((Number(h.due) || 0) * 100) / 100,
      payAmount: "",
      payEntireHead: false,
      splitIntoTwoInstallments: h.splitIntoTwoInstallments,
    };
  });
}
