import { splitFeeHeadsForDisplay } from "@/lib/feeHeadInstallmentDisplay";
import { DISCOUNT_HEAD_OVERALL_KEY, isOverallDiscountKey } from "@/lib/studentFeeHeadDiscount";
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

export type SheetDiscountApproval = {
  status: string;
  discountFixedAmount?: number | null;
  discountFeeHeadKey?: string | null;
  discountFeeHeadLabel?: string | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Pending concessions are not written onto the student fee until the chairman
 * accepts them. The fees sheet still reduces that head's balance immediately.
 * Approved amounts are already in the breakdown, so they are not applied again.
 */
export function applyPendingDiscountsToDueRows(
  rows: DueHeadRow[],
  approvals: readonly SheetDiscountApproval[] | null | undefined
): DueHeadRow[] {
  const pending = (approvals ?? []).filter((approval) => String(approval.status).toUpperCase() === "PENDING");
  let next = rows.map((row) => ({ ...row }));
  for (const approval of pending) {
    const amount = Math.max(0, Number(approval.discountFixedAmount) || 0);
    if (amount <= 0) continue;
    next = applyDiscountAmount(next, indexesForDiscount(next, approval), amount);
  }
  return next;
}

function indexesForDiscount(rows: DueHeadRow[], approval: SheetDiscountApproval): number[] {
  const key = approval.discountFeeHeadKey?.trim() ?? "";
  const label = (approval.discountFeeHeadLabel ?? "").trim().toLowerCase();

  if (key && !isOverallDiscountKey(key)) {
    if (/::INST[12]$/.test(key)) {
      const exact = rows.findIndex((row) => row.key === key);
      if (exact >= 0) return [exact];
    }
    const byKey = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.key === key || row.sourceKey === key)
      .map(({ index }) => index);
    if (byKey.length > 0) return byKey;
  }

  if (label) {
    const byLabel = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.label.trim().toLowerCase() === label)
      .map(({ index }) => index);
    if (byLabel.length > 0) return byLabel;
  }

  if (!key || key === DISCOUNT_HEAD_OVERALL_KEY) return rows.map((_, index) => index);
  return [];
}

function applyRupeeDiscount(row: DueHeadRow, amount: number): DueHeadRow {
  const room = Math.max(0, roundMoney(row.totalAmount - row.discountAmount));
  const applied = Math.min(Math.max(0, amount), room);
  if (applied <= 0) return row;
  const discountAmount = roundMoney(row.discountAmount + applied);
  const net = roundMoney(row.totalAmount - discountAmount);
  const dueBefore = Math.max(0, roundMoney(net - row.paidAmount));
  return { ...row, discountAmount, dueBefore };
}

function applyDiscountAmount(rows: DueHeadRow[], indexes: number[], amount: number): DueHeadRow[] {
  if (indexes.length === 0 || amount <= 0) return rows;
  const next = rows.map((row) => ({ ...row }));
  if (indexes.length === 1) {
    next[indexes[0]] = applyRupeeDiscount(next[indexes[0]], amount);
    return next;
  }

  const group = indexes.map((index) => next[index]);
  const gross = roundMoney(group.reduce((sum, row) => sum + row.totalAmount, 0));
  const oldDiscount = roundMoney(group.reduce((sum, row) => sum + row.discountAmount, 0));
  const room = Math.max(0, roundMoney(gross - oldDiscount));
  const applied = Math.min(amount, room);
  if (applied <= 0 || gross <= 0) return rows;

  const newNetTotal = roundMoney(gross - oldDiscount - applied);
  let netAssigned = 0;
  indexes.forEach((index, position) => {
    const row = next[index];
    const isLast = position === indexes.length - 1;
    const net = isLast ? roundMoney(newNetTotal - netAssigned) : roundMoney(newNetTotal * (row.totalAmount / gross));
    netAssigned = roundMoney(netAssigned + net);
    const discountAmount = Math.max(0, roundMoney(row.totalAmount - net));
    const dueBefore = Math.max(0, roundMoney(net - row.paidAmount));
    next[index] = { ...row, discountAmount, dueBefore };
  });
  return next;
}
