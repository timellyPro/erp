import type { PaymentFeeAllocationLine, PaymentRow, TransactionDisplayRow } from "./feeTransactionsTypes";

export function paymentFeeTypeLines(payment: PaymentRow): PaymentFeeAllocationLine[] {
  if (payment.feeAllocations && payment.feeAllocations.length > 0) {
    return payment.feeAllocations;
  }
  if (payment.feeTypeName) {
    return [
      {
        name: payment.feeTypeName,
        amount: payment.feeTypeAmount ?? payment.amount,
      },
    ];
  }
  return [];
}

/** One table row per fee head on each payment (never merge multiple heads into one row). */
export function paymentsToTransactionRows(payments: PaymentRow[]): TransactionDisplayRow[] {
  const rows: TransactionDisplayRow[] = [];

  for (const payment of payments) {
    const lines = paymentFeeTypeLines(payment);
    const base = {
      paymentId: payment.id,
      status: payment.status,
      method: payment.method,
      createdAt: payment.createdAt,
      transactionId: payment.transactionId,
      collectedByName: payment.collectedByName ?? null,
      sourcePayment: payment,
    };

    if (lines.length === 0) {
      rows.push({
        ...base,
        rowKey: payment.id,
        amount: payment.amount,
        feeTypeName: payment.feeTypeName || "-",
      });
      continue;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      rows.push({
        ...base,
        rowKey: lines.length === 1 ? payment.id : `${payment.id}:${i}:${line.name}`,
        amount: line.amount,
        feeTypeName: line.name,
      });
    }
  }

  return rows.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function isSyntheticPaymentId(id: string) {
  return id === "admission-fee" || id === "application-fee";
}

export function isPendingPaymentId(id: string) {
  return id.startsWith("pending-");
}

export function isSuccessStatus(status: string) {
  const u = String(status || "").toUpperCase();
  return u === "SUCCESS" || u === "COMPLETED";
}

export const EDIT_GATEWAY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "OFFLINE_CASH", label: "Cash" },
  { value: "OFFLINE_ONLINE", label: "Online (UPI / QR / net banking)" },
  { value: "OFFLINE_UPI", label: "UPI" },
  { value: "OFFLINE_BANK_TRANSFER", label: "Bank transfer / NEFT / RTGS" },
  { value: "OFFLINE_CHEQUE", label: "Cheque" },
  { value: "OFFLINE_DD", label: "Demand draft (DD)" },
  { value: "OFFLINE_OTHERS", label: "Others" },
  { value: "HYPERPG", label: "Online — payment gateway (HyperPG)" },
];

export function formatPaymentMethod(method?: string) {
  const m = String(method || "").trim().toUpperCase();
  if (!m) return "-";
  if (m === "OFFLINE" || m === "CASH" || m === "OFFLINE_CASH") return "Cash";
  if (m === "UPI" || m === "OFFLINE_UPI") return "UPI";
  if (m === "CHEQUE" || m === "OFFLINE_CHEQUE") return "Cheque";
  if (m === "DD" || m === "OFFLINE_DD") return "DD";
  if (m === "ONLINE" || m === "OFFLINE_ONLINE") return "Online";
  if (m === "BANK_TRANSFER" || m === "OFFLINE_BANK_TRANSFER") return "Bank Transfer";
  if (m === "CARD" || m === "OFFLINE_CARD") return "Card";
  if (m === "HYPERPG") return "Online";
  if (m === "OFFLINE_OTHERS" || m === "OTHERS") return "Others";
  if (m.startsWith("OFFLINE_")) {
    return m
      .slice("OFFLINE_".length)
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return method || "-";
}
