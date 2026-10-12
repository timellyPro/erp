import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import type { FeeDeleteSuccess, FeePaymentSuccess } from "../types";

export function normalizeBreakdownHeadKey(raw: string): string {
  const key = raw.trim();
  if (key.startsWith("BASE:")) return key.split("::")[0]!;
  if (key.startsWith("EXTRA:")) return key.split("::")[0]!;
  return key;
}

export function patchBreakdownAfterDelete(
  prev: AdminStudentFeeBreakdownResult | null,
  updatedFee: FeePaymentSuccess["updatedFee"]
): AdminStudentFeeBreakdownResult | null {
  if (!prev) return prev;
  const allCleared = updatedFee.amountPaid <= 0.00001;
  const dueHeads = allCleared
    ? prev.dueHeads.map((h) => ({ ...h, dueBefore: h.snapshotAmount }))
    : prev.dueHeads;
  return {
    ...prev,
    amountPaid: updatedFee.amountPaid,
    remainingFee: updatedFee.remainingFee,
    finalFee: updatedFee.finalFee ?? prev.finalFee,
    totalAmount: prev.totalAmount,
    dueHeads,
  };
}

export function patchBreakdownAfterPayment(
  prev: AdminStudentFeeBreakdownResult | null,
  result: FeePaymentSuccess
): AdminStudentFeeBreakdownResult | null {
  if (!prev) return prev;
  const { feeAllocations } = result;

  const deductByKey = new Map<string, number>();
  for (const line of feeAllocations ?? []) {
    const key =
      typeof (line as { key?: string }).key === "string"
        ? normalizeBreakdownHeadKey((line as { key: string }).key)
        : "";
    if (!key) continue;
    deductByKey.set(key, (deductByKey.get(key) ?? 0) + (Number(line.amount) || 0));
  }

  const dueHeads =
    deductByKey.size > 0
      ? prev.dueHeads.map((h) => {
          const deduct = deductByKey.get(normalizeBreakdownHeadKey(h.key)) ?? 0;
          if (deduct <= 0) return h;
          const dueBefore = Math.max(Math.round((h.dueBefore - deduct) * 100) / 100, 0);
          return { ...h, dueBefore };
        })
      : prev.dueHeads;

  // Breakdown metrics are current-year only — never copy StudentFee amountPaid/remaining
  // (those include previous-year payments and zero out "Fees Due" incorrectly).
  const currentYearHeads = dueHeads.filter((h) => !isPreviousYearFeeHeadName(h.label));
  const previousYearHeads = dueHeads.filter((h) => isPreviousYearFeeHeadName(h.label));
  const round = (n: number) => Math.round(n * 100) / 100;
  const totalAmount = round(currentYearHeads.reduce((s, h) => s + (Number(h.snapshotAmount) || 0), 0));
  const remainingFee = round(currentYearHeads.reduce((s, h) => s + (Number(h.dueBefore) || 0), 0));
  const amountPaid = round(
    currentYearHeads.reduce(
      (s, h) => s + Math.max((Number(h.snapshotAmount) || 0) - (Number(h.dueBefore) || 0), 0),
      0
    )
  );
  const previousYearTotalAmount = round(
    previousYearHeads.reduce((s, h) => s + (Number(h.snapshotAmount) || 0), 0)
  );
  const previousYearRemainingFee = round(
    previousYearHeads.reduce((s, h) => s + (Number(h.dueBefore) || 0), 0)
  );
  const previousYearAmountPaid = round(
    previousYearHeads.reduce(
      (s, h) => s + Math.max((Number(h.snapshotAmount) || 0) - (Number(h.dueBefore) || 0), 0),
      0
    )
  );

  return {
    ...prev,
    amountPaid,
    remainingFee,
    finalFee: totalAmount,
    totalAmount,
    previousYearTotalAmount,
    previousYearAmountPaid,
    previousYearRemainingFee,
    dueHeads,
  };
}

export function patchBreakdownAfterDeletePayment(
  prev: AdminStudentFeeBreakdownResult | null,
  updatedFee: FeeDeleteSuccess["updatedFee"],
  deletedAllocations?: Array<{ name: string; amount: number; key?: string }>
): AdminStudentFeeBreakdownResult | null {
  if (!updatedFee) return prev;
  const base = patchBreakdownAfterDelete(prev, updatedFee);
  if (!base || !deletedAllocations?.length) return base;

  const addByKey = new Map<string, number>();
  for (const line of deletedAllocations) {
    const key =
      typeof line.key === "string" && line.key.trim()
        ? normalizeBreakdownHeadKey(line.key)
        : "";
    if (!key) continue;
    addByKey.set(key, (addByKey.get(key) ?? 0) + (Number(line.amount) || 0));
  }
  if (addByKey.size === 0) return base;

  const dueHeads = base.dueHeads.map((h) => {
    const add = addByKey.get(normalizeBreakdownHeadKey(h.key)) ?? 0;
    if (add <= 0) return h;
    const dueBefore = Math.round((h.dueBefore + add) * 100) / 100;
    return { ...h, dueBefore };
  });

  return { ...base, dueHeads };
}
