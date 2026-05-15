import { FEE_ALLOCATION_PAYMENT_STATUSES } from "@/lib/feePaymentStatuses";
import { feeReportColumnFromGateway } from "@/lib/feePaymentGateway";

/** Local calendar day bounds for YYYY-MM-DD (school timezone / browser). */
export function localDayBoundsFromYmd(ymd: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

export function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function paymentCollectionBucket(gateway: string | null | undefined): "CASH" | "ONLINE" | "OTHERS" {
  const col = feeReportColumnFromGateway(gateway);
  if (col === "Cash" || col === "Cheque" || col === "DD") return "CASH";
  if (col === "ONLINE PAYMENT") return "ONLINE";
  return "OTHERS";
}

export const FEE_COLLECTION_PAYMENT_WHERE = {
  status: { in: ["SUCCESS", "COMPLETED"] as string[] },
  eventRegistrationId: null,
};

export type CollectionByMethodRow = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export function aggregateCollectionByMethod(
  payments: Array<{ amount: unknown; gateway: string | null }>
): { rows: CollectionByMethodRow[]; total: number } {
  const map = new Map<string, CollectionByMethodRow>();
  let total = 0;

  for (const payment of payments) {
    const amount = Number(payment.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const bucket = paymentCollectionBucket(payment.gateway);
    const label = bucket === "CASH" ? "Cash" : bucket === "ONLINE" ? "Online" : "Others";
    const existing = map.get(bucket);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
    } else {
      map.set(bucket, { key: bucket, label, amount, count: 1 });
    }
    total += amount;
  }

  const rows = Array.from(map.values()).sort((a, b) => {
    const priority = (key: string) => (key === "CASH" ? 0 : key === "ONLINE" ? 1 : 2);
    const byPriority = priority(a.key) - priority(b.key);
    if (byPriority !== 0) return byPriority;
    return b.amount - a.amount;
  });

  return { rows, total };
}
