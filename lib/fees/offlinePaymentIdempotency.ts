import type { Payment } from "@prisma/client";
import { isOfflinePaymentGateway } from "@/lib/fees/feePaymentGateway";

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

type PaymentByClientRequestIdClient = {
  payment: {
    findUnique: (args: {
      where: { clientRequestId: string };
    }) => Promise<Payment | null>;
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

/**
 * Retry-of-the-same-attempt guard: independent of any business reference (UTR),
 * so it also protects cash entries, which have none. The client sends the same
 * `clientRequestId` for every submit of one unsaved form attempt; if a Payment
 * already exists for it, this attempt already succeeded — return that row
 * instead of creating a second one.
 */
export async function findExistingPaymentByClientRequestId(
  tx: PaymentByClientRequestIdClient,
  clientRequestId: string | null
): Promise<Payment | null> {
  if (!clientRequestId) return null;
  return tx.payment.findUnique({ where: { clientRequestId } });
}
