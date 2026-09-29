import type { DayReportTx } from "@/lib/feeDayReportExcel";

/** True when a fee-head label is the selected head or one of its installments. */
export function feeHeadNameMatches(label: string, selectedHead: string): boolean {
  const needle = selectedHead.trim().toLowerCase().replace(/\s+/g, " ");
  if (!needle) return true;
  const name = label.trim().toLowerCase().replace(/\s+/g, " ");
  return name === needle || name.startsWith(`${needle} `) || name.startsWith(`${needle}-`);
}

/** Inclusive local-calendar range. From and to may be entered in either order. */
export function isCreatedAtInDateRange(createdAt: string, fromYmd: string, toYmd: string): boolean {
  const created = new Date(createdAt);
  const from = parseYmdLocal(fromYmd);
  const to = parseYmdLocal(toYmd || fromYmd);
  if (Number.isNaN(created.getTime()) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return false;
  }
  const day = toDateOnly(created).getTime();
  const start = toDateOnly(from).getTime();
  const end = toDateOnly(to).getTime();
  return day >= Math.min(start, end) && day <= Math.max(start, end);
}

export function orderedYmdRange(fromYmd: string, toYmd: string): { from: string; to: string } {
  const from = fromYmd;
  const to = toYmd || fromYmd;
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}

/** Keep only the selected head on a payment. Returns null when the payment has none of that head. */
export function narrowDayReportTransactionToHead(
  transaction: DayReportTx,
  headName: string
): DayReportTx | null {
  const selected = headName.trim();
  if (!selected) return transaction;

  const matched = (transaction.feeAllocations ?? []).filter((allocation) =>
    feeHeadNameMatches(allocation.name, selected)
  );
  if (matched.length > 0) {
    const amount = matched.reduce((sum, allocation) => sum + (Number(allocation.amount) || 0), 0);
    return {
      ...transaction,
      feeAllocations: matched,
      amount,
      feeTypeName: matched.map((allocation) => allocation.name).join(", "),
    };
  }
  if (transaction.feeTypeName && feeHeadNameMatches(transaction.feeTypeName, selected)) {
    return transaction;
  }
  return null;
}

export function filterDayReportTransactions(
  transactions: DayReportTx[],
  options: {
    fromYmd: string;
    toYmd: string;
    classId?: string;
    headName?: string;
  }
): DayReportTx[] {
  return transactions.flatMap((transaction) => {
    const classId = transaction.student?.class?.id || "";
    if (options.classId && classId !== options.classId) return [];
    if (!isCreatedAtInDateRange(transaction.createdAt, options.fromYmd, options.toYmd)) return [];
    const narrowed = narrowDayReportTransactionToHead(transaction, options.headName ?? "");
    return narrowed ? [narrowed] : [];
  });
}

function parseYmdLocal(ymd: string): Date {
  const parts = ymd.split("-").map((value) => Number(value));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return new Date(NaN);
  return new Date(year, month - 1, day);
}

function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
