import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import type { DueHeadRow } from "@/lib/fees/feeBreakdownPaymentRows";
import type { FeeDeleteSuccess, FeePaymentSuccess, StudentDetail } from "../types";

export function buildConfirmedPaymentResult(
  data: Record<string, unknown>,
  total: number,
  mode: string,
  paymentDate: string,
  referenceNo: string,
  selectedRows: DueHeadRow[],
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null,
  collector?: { collectedByName?: string | null; collectedByUserId?: string | null }
): FeePaymentSuccess {
  const payment = data.payment as Record<string, unknown> | undefined;
  const updatedFee = data.updatedFee as Record<string, unknown> | undefined;
  const apiCollectorName =
    typeof payment?.collectedByName === "string" ? payment.collectedByName.trim() : "";
  const apiCollectorUserId =
    typeof payment?.collectedByUserId === "string" ? payment.collectedByUserId : null;
  return {
    payment: {
      id: String(payment?.id ?? ""),
      amount: Number(payment?.amount ?? total),
      status: String(payment?.status ?? "SUCCESS"),
      gateway: typeof payment?.gateway === "string" ? payment.gateway : mode,
      createdAt:
        typeof payment?.createdAt === "string"
          ? payment.createdAt
          : paymentDate
            ? `${paymentDate}T12:00:00.000Z`
            : new Date().toISOString(),
      transactionId:
        typeof payment?.transactionId === "string" ? payment.transactionId : referenceNo.trim() || null,
      collectedByName: apiCollectorName || collector?.collectedByName || null,
      collectedByUserId: apiCollectorUserId || collector?.collectedByUserId || null,
    },
    updatedFee: {
      amountPaid: Number(
        updatedFee?.amountPaid ?? (initialFeeBreakdown?.amountPaid ?? 0) + total
      ),
      remainingFee: Number(
        updatedFee?.remainingFee ?? Math.max((initialFeeBreakdown?.remainingFee ?? 0) - total, 0)
      ),
      finalFee:
        typeof updatedFee?.finalFee === "number"
          ? updatedFee.finalFee
          : initialFeeBreakdown?.finalFee,
      totalFee:
        typeof updatedFee?.totalFee === "number"
          ? updatedFee.totalFee
          : initialFeeBreakdown?.totalAmount,
    },
    feeAllocations: Array.isArray(data.feeAllocations)
      ? (data.feeAllocations as Array<{ name?: string; amount?: number; key?: string }>).map(
          (line) => ({
            name: String(line?.name ?? "Fee"),
            amount: Number(line?.amount ?? 0),
            key: typeof line?.key === "string" ? line.key : undefined,
          })
        )
      : selectedRows.map((r) => ({
          name: r.label,
          amount: Number(r.payAmount),
          key: r.sourceKey || r.key,
        })),
  };
}

export function patchDetailAfterPayment(
  prev: StudentDetail | null,
  result: FeePaymentSuccess,
  fallbackLines?: Array<{ name: string; amount: number }>
): StudentDetail | null {
  if (!prev?.fee) return prev;
  const { payment, updatedFee } = result;
  const lines =
    result.feeAllocations && result.feeAllocations.length > 0
      ? result.feeAllocations
      : fallbackLines ?? [{ name: "Fee payment", amount: payment.amount }];

  const gateway = String(payment.gateway ?? "OFFLINE_CASH");
  const createdAt =
    typeof payment.createdAt === "string"
      ? payment.createdAt
      : new Date(payment.createdAt).toISOString();

  return {
    ...prev,
    fee: {
      ...prev.fee,
      amountPaid: updatedFee.amountPaid,
      remainingFee: updatedFee.remainingFee,
      totalFee: updatedFee.finalFee ?? prev.fee.totalFee,
    },
    payments: [
      {
        id: payment.id,
        amount: payment.amount,
        status: payment.status || "SUCCESS",
        method: gateway,
        createdAt,
        transactionId: payment.transactionId ?? null,
        collectedByName: payment.collectedByName ?? null,
        collectedByUserId: payment.collectedByUserId ?? null,
        feeAllocations: lines,
      },
      ...prev.payments.filter((p) => p.id !== payment.id),
    ],
  };
}

export function isSuccessPaymentStatus(status: string) {
  const u = String(status || "").toUpperCase();
  return u === "SUCCESS" || u === "COMPLETED";
}

export function computeUpdatedFeeAfterDelete(
  prev: StudentDetail,
  payment: { amount: number; status: string }
): FeeDeleteSuccess["updatedFee"] {
  if (!prev.fee || !isSuccessPaymentStatus(payment.status)) return null;
  const amt = Number(payment.amount) || 0;
  return {
    amountPaid: Math.max(0, Math.round((prev.fee.amountPaid - amt) * 100) / 100),
    remainingFee: Math.round((prev.fee.remainingFee + amt) * 100) / 100,
    finalFee: prev.fee.totalFee,
  };
}

export function patchDetailAfterDelete(
  prev: StudentDetail | null,
  deleteResult: FeeDeleteSuccess
): StudentDetail | null {
  if (!prev) return prev;
  const { paymentId, updatedFee } = deleteResult;
  return {
    ...prev,
    payments: prev.payments.filter((p) => p.id !== paymentId),
    fee:
      prev.fee && updatedFee
        ? {
            ...prev.fee,
            amountPaid: updatedFee.amountPaid,
            remainingFee: updatedFee.remainingFee,
            totalFee: updatedFee.finalFee ?? prev.fee.totalFee,
          }
        : prev.fee,
  };
}
