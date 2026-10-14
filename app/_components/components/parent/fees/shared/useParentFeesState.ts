import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSession } from "next-auth/react";
import {
  loadParentFees,
  peekParentFees,
  peekParentProfileShell,
  type ParentFeesPayload,
} from "@/lib/parent/loadParentPortal";
import type { FeePaymentReceiptData } from "../../../pdf/FeePaymentReceiptTemplate";
import { currentAcademicYearLabel } from "@/lib/school/resolveSchoolBrand";
import { downloadParentPortalPdf } from "@/lib/parent/downloadParentPortalPdf";
import { formatReceiptGeneratedDate } from "@/lib/fees/receiptDates";
import { formatPaymentMethod, headStatus, type DueHeadRow } from "./parentFeesHelpers";

export function useParentFeesState() {
  const { data: session } = useSession();
  const studentId = session?.user?.studentId ?? null;
  const initialPeek = peekParentFees(studentId);

  const [fee, setFee] = useState<ParentFeesPayload | null>(initialPeek);
  const [loading, setLoading] = useState(!initialPeek);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<FeePaymentReceiptData | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!studentId) {
      setLoading(false);
      setError("No student linked to this account.");
      return;
    }

    const peeked = peekParentFees(studentId);
    if (peeked) {
      setFee(peeked);
      setLoading(false);
    }

    let active = true;
    void loadParentFees(studentId, {
      onLoaded: (data) => {
        if (active) {
          setFee(data);
          setError(null);
          setLoading(false);
        }
      },
    }).catch((e) => {
      if (active && !peeked) {
        setError(e instanceof Error ? e.message : "Failed to load fee details");
        setFee(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [studentId]);

  const dueHeadRows = useMemo((): DueHeadRow[] => {
    return (fee?.dueHeads ?? []).map((h) => {
      const total = Number(h.snapshotAmount) || 0;
      const paid = Number(h.paidBefore) || 0;
      const due = Number(h.dueBefore) || 0;
      return { key: h.key, label: h.label, total, paid, due, status: headStatus(due, total) };
    });
  }, [fee?.dueHeads]);

  const transactions = useMemo(() => {
    const payments = fee?.payments ?? [];
    const refunds = fee?.refunds ?? [];
    return [
      ...payments.map((p) => ({ type: "payment" as const, ...p })),
      ...refunds.map((r) => ({ type: "refund" as const, ...r })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [fee?.payments, fee?.refunds]);

  const handleDownloadInvoice = useCallback(
    async (payment: ParentFeesPayload["payments"][number]) => {
      if (generatingPdfId || !fee) return;
      setGeneratingPdfId(payment.id);
      try {
        const profile = peekParentProfileShell(studentId);
        let capturedPayload: FeePaymentReceiptData | null = null;
        type ProfileShell = {
          student?: {
            name?: string;
            admissionNumber?: string | null;
            fatherName?: string | null;
            motherName?: string;
            phone?: string;
          };
        };
        const student = (profile as ProfileShell | null)?.student;

        const method = formatPaymentMethod(payment.gateway);
        const refNo = payment.transactionId?.trim() || "-";
        const lines =
          payment.allocations && payment.allocations.length > 0
            ? payment.allocations.map((a) => ({
                description: a.label,
                amount: a.amount,
                paymentMethod: method,
                utrNo: refNo,
              }))
            : [
                {
                  description: "School Fees Payment",
                  amount: payment.amount,
                  paymentMethod: method,
                  utrNo: refNo,
                },
              ];

        const generatedOn = formatReceiptGeneratedDate(new Date());
        const buildPayload = (brand: {
          name: string;
          logo: string | null;
          address: string;
        }): FeePaymentReceiptData => ({
          schoolName: brand.name,
          schoolLogo: brand.logo,
          schoolAddress: brand.address,
          studentName: fee.studentDisplay?.name || student?.name || "Student",
          admissionNumber: student?.admissionNumber ?? undefined,
          className: fee.studentDisplay?.class || "N/A",
          academicYear: currentAcademicYearLabel(new Date(payment.createdAt)),
          fatherName: student?.fatherName ?? undefined,
          motherName: student?.motherName,
          residencyType: "Day Scholar",
          parentName: student?.fatherName || "-",
          parentPhone: student?.phone || "-",
          transactionDate: payment.createdAt,
          generatedOn,
          lines,
          total: payment.amount,
          receiptTitle: "Fee Receipt",
        });

        await downloadParentPortalPdf({
          ref: receiptRef,
          filename: "Print receipt.pdf",
          beforeCapture: (brand) => {
            capturedPayload = buildPayload(brand);
            flushSync(() => {
              setReceiptData(capturedPayload);
            });
          },
        });
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to download receipt.");
      } finally {
        setGeneratingPdfId(null);
      }
    },
    [fee, generatingPdfId, studentId]
  );

  return {
    fee,
    loading,
    error,
    generatingPdfId,
    receiptData,
    receiptRef,
    dueHeadRows,
    transactions,
    handleDownloadInvoice,
  };
}
