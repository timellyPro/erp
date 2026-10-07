import type { Payment } from "@prisma/client";
import { isOfflinePaymentGateway } from "@/lib/feePaymentGateway";

type PaymentLookupClient = {
  payment: {
    findMany: (args: {
      where: {
        studentId: string;
        transactionId: string;
        status: { in: string[] };
      };
      orderBy: { createdAt: "desc" };
      take: number;
    }) => Promise<Payment[]>;
  };
};

/** Resolve the reference stored on Payment.transactionId from offline payment input. */
export function resolveOfflinePaymentTransactionId(
  transactionId?: string | null,
  refNo?: string | null
): string | null {
  const normalizedTxn = typeof transactionId === "string" ? transactionId.trim() : "";
  const normalizedRef = typeof refNo === "string" ? refNo.trim() : "";
  return normalizedTxn || normalizedRef || null;
}

/**
 * When staff records an offline payment with a UTR / reference, return an existing
 * SUCCESS row instead of creating a duplicate.
 */
export async function findExistingOfflinePaymentByRef(
  tx: PaymentLookupClient,
  studentId: string,
  transactionId: string | null
): Promise<Payment | null> {
  if (!transactionId) return null;

  const candidates = await tx.payment.findMany({
    where: {
      studentId,
      transactionId,
      status: { in: ["SUCCESS", "COMPLETED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return candidates.find((p) => isOfflinePaymentGateway(p.gateway)) ?? null;
}
