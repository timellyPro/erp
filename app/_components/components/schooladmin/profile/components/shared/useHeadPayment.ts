import { useState } from "react";
import { roundRupee } from "@/lib/formatRupee";
import { isPreviousYearFeeHeadName } from "@/lib/fees/feeYearClassification";
import { useIdempotencyKey } from "@/lib/utils/idempotencyKey";
import { baseComponentIndexFromHead, type HeadCard } from "./feesBreakdownHelpers";

type FeePaymentSuccess = {
  payment: {
    id: string;
    amount: number;
    status: string;
    gateway?: string;
    createdAt: string;
    transactionId?: string | null;
  };
  updatedFee: { amountPaid: number; remainingFee: number; finalFee?: number; totalFee?: number };
  feeAllocations?: Array<{ name: string; amount: number }>;
};

type PayingHead = {
  key: string;
  sourceKey?: string;
  label: string;
  due: number;
  extraFeeId?: string;
};

const selectedHeadFromCard = (head: { key: string; label: string; extraFeeId?: string; sourceKey?: string }) => {
  const baseIdx = baseComponentIndexFromHead(head);
  if (baseIdx !== null) {
    return {
      headType: "BASE_COMPONENT" as const,
      componentIndex: baseIdx,
      componentName: head.label,
    };
  }
  if (head.extraFeeId) {
    return {
      headType: "EXTRA_FEE" as const,
      extraFeeId: head.extraFeeId,
    };
  }
  const sourceKey = head.sourceKey ?? head.key;
  if (sourceKey.startsWith("EXTRA:")) {
    const extraId = sourceKey.slice("EXTRA:".length).split("::")[0];
    if (extraId) {
      return {
        headType: "EXTRA_FEE" as const,
        extraFeeId: extraId,
      };
    }
  }
  return null;
};

export function useHeadPayment({
  studentId,
  feesRecordingDisabled,
  setHeadCards,
  setHeadsRemainingAmount,
  setPreviousYearRemainingAmount,
  onFeeModified,
}: {
  studentId: string;
  feesRecordingDisabled: boolean;
  setHeadCards: React.Dispatch<React.SetStateAction<HeadCard[]>>;
  setHeadsRemainingAmount: React.Dispatch<React.SetStateAction<number | null>>;
  setPreviousYearRemainingAmount: React.Dispatch<React.SetStateAction<number>>;
  onFeeModified?: (result?: FeePaymentSuccess) => void;
}) {
  const [payingHead, setPayingHead] = useState<PayingHead | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    amount: string;
    mode: "CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS";
    referenceNo: string;
    paymentDate: string;
  }>({
    amount: "",
    mode: "CASH",
    referenceNo: "",
    paymentDate: new Date().toISOString().slice(0, 10),
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const idempotencyKey = useIdempotencyKey();

  const openHeadPaymentModal = (head: PayingHead) => {
    if (feesRecordingDisabled) return;
    idempotencyKey.renew();
    setPayingHead(head);
    setPaymentError(null);
    setPaymentForm({
      amount: head.due > 0 ? head.due.toFixed(2) : "",
      mode: "CASH",
      referenceNo: "",
      paymentDate: new Date().toISOString().slice(0, 10),
    });
  };

  const submitHeadPayment = async () => {
    if (!payingHead) return;
    setPaymentError(null);

    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError("Enter a valid payment amount.");
      return;
    }
    if (amount > payingHead.due) {
      setPaymentError(`Amount cannot exceed due amount ₹${payingHead.due.toLocaleString("en-IN")}.`);
      return;
    }
    if (paymentForm.mode !== "CASH" && !paymentForm.referenceNo.trim()) {
      setPaymentError("UTR / reference number is required for this payment mode.");
      return;
    }

    const selectedHead = selectedHeadFromCard(payingHead);
    if (!selectedHead) {
      setPaymentError("Could not identify fee head. Please try again.");
      return;
    }

    setPaymentSaving(true);
    try {
      const ref = paymentForm.referenceNo.trim();
      const allocationKey = payingHead.sourceKey ?? payingHead.key;
      const response = await fetch("/api/fees/offline-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentId,
          amount,
          paymentMode: paymentForm.mode,
          refNo: ref || undefined,
          transactionId: ref || undefined,
          selectedHeads: [selectedHead],
          paymentDate: paymentForm.paymentDate,
          explicitAllocations: [{ key: allocationKey, amount, label: payingHead.label }],
          clientRequestId: idempotencyKey.getOrCreate(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Failed to record payment");
      }
      if (data.idempotent === true) {
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : "This UTR / reference was already recorded for this fee head."
        );
      }
      const paidCardKey = payingHead.key;
      const paidPreviousYear = isPreviousYearFeeHeadName(payingHead.label);
      idempotencyKey.renew();
      setPayingHead(null);
      setPaymentSaving(false);
      setHeadCards((prev) =>
        prev.map((h) => {
          if (h.key !== paidCardKey) return h;
          return {
            ...h,
            paid: roundRupee(h.paid + amount),
            due: roundRupee(Math.max(h.due - amount, 0)),
          };
        })
      );
      if (paidPreviousYear) {
        setPreviousYearRemainingAmount((prev) => roundRupee(Math.max(prev - amount, 0)));
      } else {
        setHeadsRemainingAmount((prev) => roundRupee(Math.max((prev ?? 0) - amount, 0)));
      }
      onFeeModified?.({
        payment: {
          id: String(data.payment?.id ?? ""),
          amount: Number(data.payment?.amount ?? amount),
          status: String(data.payment?.status ?? "SUCCESS"),
          gateway: typeof data.payment?.gateway === "string" ? data.payment.gateway : paymentForm.mode,
          createdAt:
            typeof data.payment?.createdAt === "string"
              ? data.payment.createdAt
              : paymentForm.paymentDate
                ? `${paymentForm.paymentDate}T12:00:00.000Z`
                : new Date().toISOString(),
          transactionId:
            typeof data.payment?.transactionId === "string" ? data.payment.transactionId : ref || null,
        },
        updatedFee: {
          amountPaid: Number(data.updatedFee?.amountPaid ?? 0),
          remainingFee: Number(data.updatedFee?.remainingFee ?? 0),
          finalFee:
            typeof data.updatedFee?.finalFee === "number" ? data.updatedFee.finalFee : undefined,
        },
        feeAllocations: (
          Array.isArray(data.feeAllocations) && data.feeAllocations.length > 0
            ? (data.feeAllocations as Array<{ name: string; amount: number; key?: string }>)
            : [{ name: payingHead.label, amount }]
        ).map((line, index) => (index === 0 ? { ...line, key: allocationKey } : line)),
      });
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Failed to record payment");
    } finally {
      setPaymentSaving(false);
    }
  };

  return {
    payingHead,
    setPayingHead,
    paymentForm,
    setPaymentForm,
    paymentSaving,
    paymentError,
    openHeadPaymentModal,
    submitHeadPayment,
  };
}
