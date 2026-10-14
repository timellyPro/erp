import { useState } from "react";
import type { AdmissionRow, FeeType } from "./types";

export function useAdmissionPaymentDialog({
  setRows,
  setMessageTone,
  setMessage,
}: {
  setRows: React.Dispatch<React.SetStateAction<AdmissionRow[]>>;
  setMessageTone: (tone: "success" | "error") => void;
  setMessage: (message: string | null) => void;
}) {
  const [paymentDialog, setPaymentDialog] = useState<{
    row: AdmissionRow;
    feeType: FeeType;
  } | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<{
    paymentMode: string;
    paymentMethod: string;
    referenceNo: string;
    remarks: string;
  }>({
    paymentMode: "OFFLINE",
    paymentMethod: "CASH",
    referenceNo: "",
    remarks: "",
  });

  const openPaymentDialog = (row: AdmissionRow, feeType: FeeType) => {
    setPaymentForm({ paymentMode: "OFFLINE", paymentMethod: "CASH", referenceNo: "", remarks: "" });
    setPaymentDialog({ row, feeType });
  };

  const markFeePaid = async (row: AdmissionRow, feeType: FeeType) => {
    setPaying(true);
    setPaymentError(null);
    try {
      if ((paymentForm.paymentMethod === "UPI" || paymentForm.paymentMethod === "BANK_TRANSFER") && !paymentForm.referenceNo.trim()) {
        throw new Error("Reference number / UTR is required for UPI and Bank Transfer");
      }
      const res = await fetch(`/api/admissions/${row.id}/fee-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeType,
          paymentMode: paymentForm.paymentMode,
          paymentMethod: paymentForm.paymentMethod,
          referenceNo: paymentForm.referenceNo,
          remarks: paymentForm.remarks,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Failed to mark fee as paid");
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                applicationFeePaid:
                  feeType === "APPLICATION"
                    ? true
                    : r.applicationFeePaid ?? false,
                applicationFeePaidAt:
                  feeType === "APPLICATION"
                    ? new Date().toISOString()
                    : r.applicationFeePaidAt ?? null,
                applicationFeePaymentMode:
                  feeType === "APPLICATION"
                    ? paymentForm.paymentMode
                    : r.applicationFeePaymentMode ?? null,
                applicationFeePaymentMethod:
                  feeType === "APPLICATION"
                    ? paymentForm.referenceNo
                      ? `${paymentForm.paymentMethod} | REF:${paymentForm.referenceNo}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                      : `${paymentForm.paymentMethod}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                    : r.applicationFeePaymentMethod ?? null,
                admissionFeePaid:
                  feeType === "ADMISSION" ? true : r.admissionFeePaid ?? false,
                admissionFeePaidAt:
                  feeType === "ADMISSION"
                    ? new Date().toISOString()
                    : r.admissionFeePaidAt ?? null,
                admissionFeePaymentMode:
                  feeType === "ADMISSION"
                    ? paymentForm.paymentMode
                    : r.admissionFeePaymentMode ?? null,
                admissionFeePaymentMethod:
                  feeType === "ADMISSION"
                    ? paymentForm.referenceNo
                      ? `${paymentForm.paymentMethod} | REF:${paymentForm.referenceNo}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                      : `${paymentForm.paymentMethod}${paymentForm.remarks ? ` | REMARKS:${paymentForm.remarks}` : ""}`
                    : r.admissionFeePaymentMethod ?? null,
                remarks:
                  feeType === "ADMISSION" || feeType === "APPLICATION"
                    ? paymentForm.remarks || null
                    : r.remarks ?? null,
              }
            : r
        )
      );
      setMessageTone("success");
      setMessage(data?.message || "Fee marked as paid");
      setPaymentDialog(null);
      setPaymentForm({ paymentMode: "OFFLINE", paymentMethod: "CASH", referenceNo: "", remarks: "" });
    } catch (e) {
      setPaymentError(e instanceof Error ? e.message : "Failed to mark fee as paid");
    } finally {
      setPaying(false);
    }
  };

  return {
    paymentDialog,
    setPaymentDialog,
    paying,
    paymentError,
    paymentForm,
    setPaymentForm,
    openPaymentDialog,
    markFeePaid,
  };
}
