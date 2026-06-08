"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Zap, Settings, PlusCircle, Trash2, Pencil, X, Tag, AlertCircle } from "lucide-react";
import { generatePDF } from "@/lib/pdfUtils";
import { ModifyFeeModal, DISCOUNT_HEAD_OVERALL_KEY, type FeeHeadOption } from "./ModifyFeeModal";
import { AddExtraFeeModal } from "./AddExtraFeeModal";
import { AssignFeeHeadsCatalogModal } from "./AssignFeeHeadsCatalogModal";
import { EditExtraFeeModal } from "./EditExtraFeeModal";
import { splitFeeHeadsForDisplay } from "@/lib/feeHeadInstallmentDisplay";
import { storedDiscountRupeeAmount } from "@/lib/studentFeeHeadDiscount";
import { formatRupee, roundRupee } from "@/lib/formatRupee";
import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";

function baseComponentIndexFromHead(head: {
  key: string;
  sourceKey?: string;
  extraFeeId?: string;
}): number | null {
  if (head.extraFeeId) return null;
  const sk = head.sourceKey ?? head.key;
  if (!sk.startsWith("BASE:")) return null;
  const rest = sk.slice("BASE:".length);
  const idxPart = rest.split("::")[0];
  const n = Number(idxPart);
  return Number.isFinite(n) ? n : null;
}

type Props = {
  studentId: string;
  /** Required to edit or delete class-wide (structure) fee heads from this screen. */
  classId?: string | null;
  totalFee: number;
  baseTotalFee: number;
  discountPercent: number;
  amountPaid: number;
  remainingFee: number;
  /** Optional contextual info for PDFs */
  studentName?: string;
  admissionNumber?: string;
  classDisplayName?: string;
  schoolName?: string;
  payments?: Array<{
    id: string;
    amount: number;
    status: string;
    feeTypeName?: string;
    feeTypeAmount?: number;
    feeAllocations?: Array<{ name: string; amount: number }>;
    createdAt: string;
  }>;
  discountFeeHeadKey?: string | null;
  discountFeeHeadLabel?: string | null;
  discountRemarks?: string | null;
  discountFixedAmount?: number | null;
  onFeeModified?: (paymentResult?: {
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
  }) => void;
  /** Used to seed assign-from-catalog rows (hostel vs transport hint). */
  residencyType?: string | null;
  classSection?: string | null;
  /** Preloaded from details-bundle (only source — no client refetch to avoid stale overwrite). */
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null;
  /** Parent is still loading breakdown after profile shell. */
  feeBreakdownPending?: boolean;
};

export const FeesBreakdown = ({
  studentId,
  classId = null,
  totalFee,
  baseTotalFee,
  discountPercent,
  amountPaid,
  remainingFee,
  studentName,
  admissionNumber,
  classDisplayName,
  schoolName,
  payments = [],
  discountFeeHeadKey,
  discountFeeHeadLabel,
  discountRemarks,
  discountFixedAmount,
  onFeeModified,
  residencyType,
  classSection = null,
  initialFeeBreakdown = null,
  feeBreakdownPending = false,
}: Props) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [showModifyFee, setShowModifyFee] = useState(false);
  const [showAddExtraFee, setShowAddExtraFee] = useState(false);
  const [showAssignFeeHeadsCatalog, setShowAssignFeeHeadsCatalog] = useState(false);
  const [editExtra, setEditExtra] = useState<{
    id: string;
    name: string;
    amount: number;
    splitIntoTwoInstallments?: boolean;
  } | null>(null);
  const headsLoading = feeBreakdownPending && !initialFeeBreakdown?.dueHeads?.length;
  const [deletingExtraId, setDeletingExtraId] = useState<string | null>(null);
  const [baseHeadBusyKey, setBaseHeadBusyKey] = useState<string | null>(null);
  const [editBaseHead, setEditBaseHead] = useState<{
    classId: string;
    componentIndex: number;
    name: string;
    amount: string;
  } | null>(null);
  const [editBaseError, setEditBaseError] = useState("");
  const [baseStructureMutating, setBaseStructureMutating] = useState(false);
  const [feeHeadOptionsForDiscount, setFeeHeadOptionsForDiscount] = useState<FeeHeadOption[]>([]);
  const [headCards, setHeadCards] = useState<
    Array<{
      key: string;
      sourceKey?: string;
      label: string;
      amount: number;
      paid: number;
      due: number;
      extraFeeId?: string;
      canDeleteExtra?: boolean;
      extraFeeFullAmount?: number;
      extraFeeNameForEdit?: string;
      splitIntoTwoInstallments?: boolean;
      headType?: string;
    }>
  >([]);
  const [headsTotalAmount, setHeadsTotalAmount] = useState<number | null>(null);
  const [headsRemainingAmount, setHeadsRemainingAmount] = useState<number | null>(null);
  const [payingHead, setPayingHead] = useState<{
    key: string;
    sourceKey?: string;
    label: string;
    due: number;
    extraFeeId?: string;
  } | null>(null);
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

  // Paid-by-type from payments (PDF fallback only; table uses headCards / paymentProgressRows).
  const feeBreakdown = new Map<string, { amount: number; paidAmount: number }>();
  for (const payment of payments) {
    const lines =
      payment.feeAllocations && payment.feeAllocations.length > 0
        ? payment.feeAllocations
        : payment.feeTypeName
          ? [{ name: payment.feeTypeName, amount: payment.feeTypeAmount ?? payment.amount }]
          : [];

    for (const line of lines) {
      const feeType = line.name || "Other Fees";
      const paidAmount = line.amount;
      if (!feeBreakdown.has(feeType)) {
        feeBreakdown.set(feeType, { amount: paidAmount, paidAmount });
      } else {
        const existing = feeBreakdown.get(feeType)!;
        existing.amount += paidAmount;
        existing.paidAmount += paidAmount;
      }
    }
  }

  /** All fee heads with amount / paid / due — matches cards above and every allocation. */
  const paymentProgressRows = useMemo(
    () =>
      headCards.map((h) => ({
        key: h.key,
        feeType: h.label,
        amount: h.amount,
        paid: h.paid,
        due: h.due,
      })),
    [headCards]
  );

  const discountAmount =
    typeof discountFixedAmount === "number" && discountFixedAmount > 0
      ? discountFixedAmount
      : storedDiscountRupeeAmount(baseTotalFee, totalFee, discountFixedAmount);
  /** Prefer breakdown head sum when loaded — stored StudentFee can be stale after bulk extra cleanup. */
  const displayTotalAmount =
    headsTotalAmount != null && headsTotalAmount > 0
      ? headsTotalAmount
      : totalFee > 0
        ? totalFee
        : 0;
  const displayAmountPaid =
    headCards.length > 0
      ? roundRupee(headCards.reduce((s, h) => s + h.paid, 0))
      : amountPaid;
  const displayRemainingAmount =
    headCards.length > 0
      ? roundRupee(headCards.reduce((s, h) => s + h.due, 0))
      : headsRemainingAmount != null && headsRemainingAmount >= 0
        ? roundRupee(headsRemainingAmount)
        : roundRupee(Math.max(0, displayTotalAmount - displayAmountPaid));
  const paidPercentage =
    displayTotalAmount > 0 ? (displayAmountPaid / displayTotalAmount) * 100 : 0;

  const applyBreakdownData = (data: AdminStudentFeeBreakdownResult) => {
    const dueHeads = Array.isArray(data?.dueHeads) ? data.dueHeads : [];
    const normalized = dueHeads.map((h) => {
      const amount = Math.round((Number(h.snapshotAmount) || 0) * 100) / 100;
      const gross =
        Math.round((Number(h.grossAmount ?? h.snapshotAmount) || 0) * 100) / 100;
      const due = Math.round((Number(h.dueBefore) || 0) * 100) / 100;
      return {
      key: String(h.key),
      label: String(h.label || "Fee Head"),
      amount,
      gross,
      paid: Math.max(amount - due, 0),
      due,
      extraFeeId: h.headType === "EXTRA_FEE" ? h.extraFeeId : undefined,
      canDeleteExtra: h.headType === "EXTRA_FEE" ? Boolean(h.canDeleteOnStudentProfile) : false,
      headType: h.headType,
      splitIntoTwoInstallments:
        h.headType === "EXTRA_FEE" ? Boolean(h.splitIntoTwoInstallments) : undefined,
    };
    });
    setFeeHeadOptionsForDiscount(
      normalized.map((h) => ({
        key: h.key,
        label: h.label,
      }))
    );
    const splitHeads = splitFeeHeadsForDisplay(normalized);
    setHeadCards(splitHeads);
    setHeadsTotalAmount(
      roundRupee(
        Number(data?.totalAmount) ||
          splitHeads.reduce((s: number, h: { amount: number }) => s + h.amount, 0)
      )
    );
    setHeadsRemainingAmount(roundRupee(splitHeads.reduce((s: number, h: { due: number }) => s + h.due, 0)));
  };

  useEffect(() => {
    if (!initialFeeBreakdown?.dueHeads?.length) return;
    applyBreakdownData(initialFeeBreakdown);
  }, [initialFeeBreakdown, studentId]);

  const handleDownloadReceipt = async () => {
    try {
      setIsGeneratingReceipt(true);
      const timestamp = new Date().toLocaleDateString("en-IN");
      await generatePDF(receiptRef, `fee_receipt_${timestamp}.pdf`);
    } catch (error) {
      console.error("Failed to download receipt:", error);
      alert("Failed to download receipt. Please try again.");
    } finally {
      setIsGeneratingReceipt(false);
    }
  };

  const displaySchoolName = schoolName || "School Name";
  const displayStudentName = studentName || "Student";
  const displayAdmission = admissionNumber || "—";
  const displayClass = classDisplayName || "—";

  const openHeadPaymentModal = (head: {
    key: string;
    sourceKey?: string;
    label: string;
    due: number;
    extraFeeId?: string;
  }) => {
    setPayingHead(head);
    setPaymentError(null);
    setPaymentForm({
      amount: head.due > 0 ? head.due.toFixed(2) : "",
      mode: "CASH",
      referenceNo: "",
      paymentDate: new Date().toISOString().slice(0, 10),
    });
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

  const normalizeStructureComponentsForSave = (
    raw: Array<{ name: unknown; amount: unknown }>
  ): Array<{ name: string; amount: number }> =>
    raw
      .map((c) => ({
        name: typeof c.name === "string" ? c.name.trim() : String(c.name ?? "").trim(),
        amount: typeof c.amount === "number" ? c.amount : Number(c.amount),
      }))
      .filter((c) => c.name.length > 0 && Number.isFinite(c.amount));

  const persistClassFeeStructure = async (
    targetClassId: string,
    rawComponents: Array<{ name: unknown; amount: unknown }>
  ) => {
    const normalized = normalizeStructureComponentsForSave(rawComponents);
    if (normalized.length === 0) {
      const res = await fetch(`/api/fees/structure?classId=${encodeURIComponent(targetClassId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Failed to remove fee structure");
      }
      return;
    }
    const res = await fetch("/api/fees/structure", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ classId: targetClassId, components: normalized }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Failed to save fee structure");
    }
  };

  const fetchClassStructureRows = async (
    targetClassId: string
  ): Promise<Array<{ name: unknown; amount: unknown }>> => {
    const res = await fetch(`/api/fees/structure?classId=${encodeURIComponent(targetClassId)}`, {
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Could not load fee structure");
    }
    const structures = Array.isArray(data.structures) ? data.structures : [];
    const s = structures.find((x: { classId: string }) => x.classId === targetClassId);
    return Array.isArray(s?.components) ? s.components : [];
  };

  const handleSaveEditBaseHead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBaseHead) return;
    setEditBaseError("");
    const name = editBaseHead.name.trim();
    const amt = Number(editBaseHead.amount);
    if (!name) {
      setEditBaseError("Please enter a fee name.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setEditBaseError("Please enter a valid positive amount.");
      return;
    }
    setBaseStructureMutating(true);
    try {
      const rows = await fetchClassStructureRows(editBaseHead.classId);
      if (editBaseHead.componentIndex < 0 || editBaseHead.componentIndex >= rows.length) {
        alert("That fee head no longer exists in the class structure. Refresh the page.");
        setEditBaseHead(null);
        return;
      }
      const next = rows.map((c, i) =>
        i === editBaseHead.componentIndex
          ? { name, amount: amt }
          : {
              name: typeof c.name === "string" ? c.name : String(c.name ?? ""),
              amount: typeof c.amount === "number" ? c.amount : Number(c.amount),
            }
      );
      await persistClassFeeStructure(editBaseHead.classId, next);
      setEditBaseHead(null);
      onFeeModified?.();
    } catch (err) {
      setEditBaseError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBaseStructureMutating(false);
    }
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
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Failed to record payment");
      }
      const paidCardKey = payingHead.key;
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
      setHeadsRemainingAmount((prev) => roundRupee(Math.max((prev ?? 0) - amount, 0)));
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

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-3 sm:p-6 min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 min-w-0">
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2 min-w-0">
          <Zap className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <span className="leading-tight">Fees Breakdown</span>
        </h3>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={() => setShowAssignFeeHeadsCatalog(true)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] touch-manipulation bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-100 rounded-lg text-sm font-semibold transition-colors"
          >
            <PlusCircle className="w-4 h-4 flex-shrink-0" />
            Assign from catalog
          </button>
          <button
            type="button"
            onClick={() => setShowAddExtraFee(true)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] touch-manipulation bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <PlusCircle className="w-4 h-4 flex-shrink-0" />
            Add Extra Fee
          </button>
          <button
            type="button"
            onClick={() => setShowModifyFee(true)}
            className="inline-flex items-center justify-center gap-2 px-3 py-2.5 min-h-[44px] touch-manipulation bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            Edit Fee Setup
          </button>
          {/* {payments.length > 0 && (
            <button
              onClick={handleDownloadReceipt}
              disabled={isGeneratingReceipt}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              {isGeneratingReceipt ? "Generating..." : "Download Receipt"}
            </button>
          )} */}
        </div>
      </div>

      {/* Main Fee Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-amber-400/10 border border-amber-400/20 rounded-xl p-4">
          <p className="text-xs text-amber-300/70 uppercase tracking-widest font-bold">Total Fees (All Heads)</p>
          <p className="text-2xl font-bold text-white mt-2">₹{formatRupee(displayTotalAmount)}</p>
          <p className="text-xs text-amber-300 mt-1 font-semibold">
            Pre-discount (structure + extras): ₹{formatRupee(baseTotalFee)}
          </p>
          <p className="text-xs text-amber-300 mt-1 font-semibold">
            Discount: ₹{formatRupee(discountAmount)}
          </p>
          {(discountFeeHeadLabel?.trim() ||
            discountRemarks?.trim() ||
            discountFeeHeadKey?.trim()) ? (
            <div className="mt-2 rounded-lg border border-amber-500/25 bg-black/20 px-2.5 py-2 text-left space-y-1">
              {discountFeeHeadLabel?.trim() ? (
                <p className="text-[11px] text-amber-200/90">
                  <span className="font-bold text-amber-300/80">Discount head: </span>
                  {discountFeeHeadLabel}
                </p>
              ) : discountFeeHeadKey?.trim() ? (
                <p className="text-[11px] text-amber-200/90">
                  <span className="font-bold text-amber-300/80">Discount head: </span>
                  {discountFeeHeadKey.trim() === DISCOUNT_HEAD_OVERALL_KEY
                    ? "Overall / consolidated"
                    : discountFeeHeadKey}
                </p>
              ) : null}
              {discountRemarks?.trim() ? (
                <p className="text-[11px] text-amber-200/80 leading-snug">
                  <span className="font-bold text-amber-300/80">Remarks: </span>
                  {discountRemarks}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="bg-lime-400/10 border border-lime-400/20 rounded-xl p-4">
          <p className="text-xs text-lime-300/70 uppercase tracking-widest font-bold">Amount Paid</p>
          <p className="text-2xl font-bold text-white mt-2">₹{formatRupee(displayAmountPaid)}</p>
          <p className="text-xs text-lime-400 mt-1 font-semibold">{Math.round(paidPercentage)}% Paid</p>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-red-300/70 uppercase tracking-widest font-bold">Remaining / Due</p>
          <p className="text-2xl font-bold text-white mt-2">₹{formatRupee(displayRemainingAmount)}</p>
          <p className="text-xs text-red-400 mt-1 font-semibold">
            {Math.round(100 - paidPercentage)}% Pending
          </p>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-300">Global Fee Breakdown Configuration</p>
          {headsLoading ? <p className="text-xs text-gray-500">Loading heads...</p> : null}
        </div>
        {headCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {headCards.map((h) => (
              <div
                key={h.key}
                className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2 min-h-[8.5rem]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide min-w-0 flex-1">{h.label}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {h.extraFeeId ? (
                      <>
                        <button
                          type="button"
                          title="Edit this fee head (applies to everyone in scope for school/class fees)"
                          disabled={deletingExtraId === h.extraFeeId}
                          onClick={() =>
                            setEditExtra({
                              id: h.extraFeeId!,
                              name: h.extraFeeNameForEdit ?? h.label,
                              amount: h.extraFeeFullAmount ?? h.amount,
                              splitIntoTwoInstallments: h.splitIntoTwoInstallments,
                            })
                          }
                          className="p-2 rounded-lg border border-white/15 text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title={
                            h.canDeleteExtra
                              ? "Remove this student-only extra fee"
                              : "Remove this fee head (school/class/section — affects all students in scope)"
                          }
                          disabled={deletingExtraId === h.extraFeeId}
                          onClick={async () => {
                            const feeTitle = h.extraFeeNameForEdit ?? h.label;
                            const msg = h.canDeleteExtra
                              ? `Remove extra fee "${feeTitle}" for this student? Their total due will be reduced by the full fee amount.`
                              : `Delete fee "${feeTitle}" from the catalog? This removes it for every student in its scope (school / class / section), not only this profile.`;
                            if (!confirm(msg)) {
                              return;
                            }
                            try {
                              setDeletingExtraId(h.extraFeeId!);
                              const res = await fetch(`/api/fees/extra/${encodeURIComponent(h.extraFeeId!)}`, {
                                method: "DELETE",
                                credentials: "include",
                              });
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                alert(typeof data.message === "string" ? data.message : "Delete failed");
                                return;
                              }
                              onFeeModified?.();
                            } catch {
                              alert("Delete failed");
                            } finally {
                              setDeletingExtraId(null);
                            }
                          }}
                          className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : null}
                    {!h.extraFeeId && classId && baseComponentIndexFromHead(h) !== null ? (
                      <>
                        <button
                          type="button"
                          title="Edit class fee head (updates the global fee structure for every student in this class)"
                          disabled={baseHeadBusyKey === h.key || baseStructureMutating}
                          onClick={async () => {
                            if (!classId) {
                              alert(
                                "This student has no class assigned. Class fee heads can only be edited when the student is in a class."
                              );
                              return;
                            }
                            const idx = baseComponentIndexFromHead(h);
                            if (idx === null) return;
                            setEditBaseError("");
                            setBaseHeadBusyKey(h.key);
                            try {
                              const rows = await fetchClassStructureRows(classId);
                              const row = rows[idx] as { name?: unknown; amount?: unknown } | undefined;
                              if (!row) {
                                alert("That fee head no longer exists in the class structure. Refresh the page.");
                                return;
                              }
                              setEditBaseHead({
                                classId,
                                componentIndex: idx,
                                name: typeof row.name === "string" ? row.name : String(row.name ?? ""),
                                amount: String(
                                  typeof row.amount === "number" ? row.amount : Number(row.amount ?? 0)
                                ),
                              });
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "Could not load fee structure.");
                            } finally {
                              setBaseHeadBusyKey(null);
                            }
                          }}
                          className="p-2 rounded-lg border border-white/15 text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Remove class fee head from the class structure (affects every student in this class)"
                          disabled={baseHeadBusyKey === h.key || baseStructureMutating}
                          onClick={async () => {
                            if (!classId) {
                              alert(
                                "This student has no class assigned. Class fee heads can only be removed when the student is in a class."
                              );
                              return;
                            }
                            const idx = baseComponentIndexFromHead(h);
                            if (idx === null) return;
                            const feeTitle = h.label;
                            if (
                              !confirm(
                                `Remove "${feeTitle}" from the class fee structure?\n\nThis updates the global breakdown for every student in this class, not only this student.`
                              )
                            ) {
                              return;
                            }
                            setBaseHeadBusyKey(h.key);
                            setBaseStructureMutating(true);
                            try {
                              const rows = await fetchClassStructureRows(classId);
                              if (idx < 0 || idx >= rows.length) {
                                alert("That fee head no longer exists in the class structure. Refresh the page.");
                                return;
                              }
                              const next = rows.filter((_, i) => i !== idx);
                              await persistClassFeeStructure(classId, next);
                              onFeeModified?.();
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "Delete failed");
                            } finally {
                              setBaseStructureMutating(false);
                              setBaseHeadBusyKey(null);
                            }
                          }}
                          className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <p className="text-lg font-bold text-white">₹{formatRupee(h.amount)}</p>
                <p className="text-xs text-lime-400 mt-auto">
                  Paid: ₹{formatRupee(h.paid)}
                </p>
                <p className="text-xs text-red-400">
                  Remaining: ₹{formatRupee(h.due)}
                </p>
                {h.due > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      openHeadPaymentModal({
                        key: h.key,
                        sourceKey: h.sourceKey,
                        label: h.label,
                        due: h.due,
                        extraFeeId: h.extraFeeId,
                      })
                    }
                    className="mt-2 inline-flex items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors"
                  >
                    Record Payment
                  </button>
                ) : (
                  <p className="mt-2 text-[11px] font-semibold text-lime-400">Fully paid</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-500">
            No fee head cards available.
          </div>
        )}
      </div>

      {/* Payment Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-300">Payment Progress</p>
          <p className="text-sm text-gray-400">{Math.round(paidPercentage)}%</p>
        </div>
        <div className="w-full h-3 bg-black/30 rounded-full overflow-hidden border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-lime-400 to-green-400 transition-all duration-500"
            style={{ width: `${paidPercentage}%` }}
          />
        </div>
      </div>

      {/* Fee head progress — one row per configured fee head */}
      {headsLoading ? (
        <div className="text-center py-8 text-gray-500 text-sm">Loading fee breakdown…</div>
      ) : paymentProgressRows.length > 0 ? (
        <div className="overflow-x-auto -mx-1 sm:mx-0 overscroll-x-contain touch-pan-x pb-1">
          <table className="w-full text-left min-w-[480px] sm:min-w-0">
            <thead>
              <tr className="text-[11px] text-gray-400 font-bold tracking-wider uppercase border-b border-white/5">
                <th className="pb-4 font-medium">Fee Type</th>
                <th className="pb-4 font-medium text-right">Amount</th>
                <th className="pb-4 font-medium text-right">Paid</th>
                <th className="pb-4 font-medium text-right">Remaining</th>
                <th className="pb-4 font-medium text-right">%</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {paymentProgressRows.map((row) => {
                const percentage = row.amount > 0 ? (row.paid / row.amount) * 100 : 0;
                return (
                  <tr
                    key={row.key}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-4 sm:py-5 font-semibold text-gray-100">{row.feeType}</td>
                    <td className="py-4 sm:py-5 text-right text-gray-400">
                      ₹{row.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-right font-semibold text-lime-400">
                      ₹{row.paid.toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-right text-gray-400">
                      ₹{row.due.toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-right">
                      <span className={`${percentage >= 100 ? "text-lime-400" : "text-amber-400"} font-semibold`}>
                        {Math.round(percentage)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : feeBreakdown.size > 0 ? (
        <div className="overflow-x-auto -mx-1 sm:mx-0 overscroll-x-contain touch-pan-x pb-1">
          <table className="w-full text-left min-w-[480px] sm:min-w-0">
            <thead>
              <tr className="text-[11px] text-gray-400 font-bold tracking-wider uppercase border-b border-white/5">
                <th className="pb-4 font-medium">Fee Type</th>
                <th className="pb-4 font-medium text-right">Paid</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {Array.from(feeBreakdown.entries()).map(([feeType, data]) => (
                <tr key={feeType} className="border-b border-white/5 last:border-0">
                  <td className="py-4 font-semibold text-gray-100">{feeType}</td>
                  <td className="py-4 text-right font-semibold text-lime-400">
                    ₹{data.paidAmount.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 text-sm">No fee breakdown data available yet.</div>
      )}

      {/* Payment Status */}
      <div className="mt-8 pt-6 border-t border-white/10">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-4">Payment Status Legend</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-lime-400" />
            <span className="text-gray-300">Fully Paid</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="text-gray-300">Partial Payment</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-300">Not Paid</span>
          </div>
        </div>
      </div>

      {/* Hidden Receipt Section for PDF */}
      <div ref={receiptRef} className="hidden">
        <div className="p-8 bg-white text-black" style={{ width: "210mm", minHeight: "297mm" }}>
          {/* Header with school + Timelly branding */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">{displaySchoolName}</h1>
              <p className="text-sm text-gray-600 mt-1">Student Fee Receipt</p>
            </div>
            <div className="text-right flex flex-col items-end">
              <p className="text-xs font-semibold text-gray-500 mb-1">Powered by</p>
              <img src="/timelylogo.webp" alt="Timelly Logo" className="h-6 object-contain" crossOrigin="anonymous" />
            </div>
          </div>

          {/* Student meta */}
          <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Student Name</p>
              <p className="font-semibold">{displayStudentName}</p>
            </div>
            <div>
              <p className="text-gray-500">Admission No.</p>
              <p className="font-semibold">{displayAdmission}</p>
            </div>
            <div>
              <p className="text-gray-500">Class</p>
              <p className="font-semibold">{displayClass}</p>
            </div>
            <div>
              <p className="text-gray-500">Generated On</p>
              <p className="font-semibold">
                {new Date().toLocaleDateString("en-IN")} • {new Date().toLocaleTimeString("en-IN")}
              </p>
            </div>
          </div>

          <div className="mb-8 border-b-2 border-gray-300 pb-4">
            <h2 className="text-xl font-semibold mb-4">Fee Summary</h2>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-gray-600 text-sm">Total Fees</p>
                <p className="text-2xl font-bold">₹{formatRupee(totalFee)}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Amount Paid</p>
                <p className="text-2xl font-bold text-green-600">₹{formatRupee(displayAmountPaid)}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Amount Due</p>
                <p className="text-2xl font-bold text-red-600">₹{formatRupee(displayRemainingAmount)}</p>
              </div>
            </div>
            <div className="bg-gray-100 p-3 rounded">
              <p className="text-sm text-gray-700">
                Payment Progress: <span className="font-bold">{Math.round(paidPercentage)}% Complete</span>
              </p>
            </div>
          </div>

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Payment History</h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border border-gray-300 p-2 text-left font-semibold">Date</th>
                    <th className="border border-gray-300 p-2 text-left font-semibold">Fee Type</th>
                    <th className="border border-gray-300 p-2 text-right font-semibold">Amount</th>
                    <th className="border border-gray-300 p-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 p-2 text-sm">
                        {new Date(payment.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="border border-gray-300 p-2 text-sm">
                        {payment.feeTypeName || "Other Fees"}
                      </td>
                      <td className="border border-gray-300 p-2 text-right font-semibold text-sm">
                        ₹{payment.amount.toLocaleString("en-IN")}
                      </td>
                      <td className="border border-gray-300 p-2 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-white text-xs font-semibold ${payment.status === "completed" ? "bg-green-600" : "bg-amber-600"
                            }`}
                        >
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Fee Type Breakdown */}
          {feeBreakdown.size > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Fee Breakdown by Type</h2>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-200">
                    <th className="border border-gray-300 p-2 text-left font-semibold">Fee Type</th>
                    <th className="border border-gray-300 p-2 text-right font-semibold">Amount</th>
                    <th className="border border-gray-300 p-2 text-right font-semibold">Paid</th>
                    <th className="border border-gray-300 p-2 text-right font-semibold">Remaining</th>
                    <th className="border border-gray-300 p-2 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(feeBreakdown.entries()).map(([feeType, data]) => {
                    const remaining = data.amount - data.paidAmount;
                    const percentage = data.amount > 0 ? (data.paidAmount / data.amount) * 100 : 0;
                    return (
                      <tr key={feeType} className="hover:bg-gray-50">
                        <td className="border border-gray-300 p-2 font-semibold text-sm">{feeType}</td>
                        <td className="border border-gray-300 p-2 text-right text-sm">
                          ₹{data.amount.toLocaleString("en-IN")}
                        </td>
                        <td className="border border-gray-300 p-2 text-right font-semibold text-green-600 text-sm">
                          ₹{data.paidAmount.toLocaleString("en-IN")}
                        </td>
                        <td className="border border-gray-300 p-2 text-right text-sm">
                          ₹{remaining.toLocaleString("en-IN")}
                        </td>
                        <td className="border border-gray-300 p-2 text-right font-semibold text-sm">
                          {Math.round(percentage)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t-2 border-gray-300 pt-4 mt-8">
            <p className="text-gray-600 text-xs text-center">
              This is a computer-generated receipt and is valid without a signature.
            </p>
            <div className="flex justify-center items-center gap-2 mt-3">
              <p className="text-gray-500 text-xs">Powered by</p>
              <img src="/timelylogo.webp" alt="Timelly Logo" className="h-4 object-contain" crossOrigin="anonymous" />
            </div>
          </div>
        </div>
      </div>

      {showModifyFee && (
        <ModifyFeeModal
          studentId={studentId}
          currentTotalFee={baseTotalFee}
          currentDiscountPercent={discountPercent}
          feeHeadOptions={feeHeadOptionsForDiscount}
          initialDiscountFeeHeadKey={discountFeeHeadKey ?? null}
          initialDiscountFeeHeadLabel={discountFeeHeadLabel ?? null}
          initialDiscountRemarks={discountRemarks ?? null}
          initialDiscountFixedAmount={discountFixedAmount ?? null}
          onClose={() => setShowModifyFee(false)}
          onSuccess={() => {
            setShowModifyFee(false);
            onFeeModified?.();
          }}
        />
      )}

      {showAssignFeeHeadsCatalog && (
        <AssignFeeHeadsCatalogModal
          studentId={studentId}
          studentName={studentName ?? "Student"}
          classDisplayName={classDisplayName ?? "-"}
          classId={classId}
          classSection={classSection}
          residencyType={residencyType}
          onClose={() => setShowAssignFeeHeadsCatalog(false)}
          onSuccess={() => {
            setShowAssignFeeHeadsCatalog(false);
            onFeeModified?.();
          }}
        />
      )}

      {showAddExtraFee && (
        <AddExtraFeeModal
          studentId={studentId}
          onClose={() => setShowAddExtraFee(false)}
          onSuccess={() => {
            setShowAddExtraFee(false);
            onFeeModified?.();
          }}
        />
      )}

      {editBaseHead && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-[#0F172A] shadow-2xl">
            <div className="p-6">
              <h2 className="mb-2 text-2xl font-bold text-white">Edit class fee head</h2>
              <p className="mb-6 text-sm text-gray-400">
                This updates the class fee structure. Every student in this class gets recalculated totals from the
                updated heads (plus extras and discounts).
              </p>
              <form onSubmit={handleSaveEditBaseHead} className="space-y-5">
                {editBaseError ? (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <p>{editBaseError}</p>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-300">Fee name</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Tag className="h-5 w-5 text-gray-500" />
                    </div>
                    <input
                      type="text"
                      value={editBaseHead.name}
                      onChange={(e) =>
                        setEditBaseHead((prev) => (prev ? { ...prev, name: e.target.value } : null))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pl-10 pr-4 text-white outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-300">Amount (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editBaseHead.amount}
                    onChange={(e) =>
                      setEditBaseHead((prev) => (prev ? { ...prev, amount: e.target.value } : null))
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => !baseStructureMutating && setEditBaseHead(null)}
                    className="flex-1 rounded-xl border border-white/15 py-3 text-sm font-semibold text-white/80 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={baseStructureMutating}
                    className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {baseStructureMutating ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {editExtra && (
        <EditExtraFeeModal
          extraFeeId={editExtra.id}
          initialName={editExtra.name}
          initialAmount={editExtra.amount}
          initialSplitIntoTwoInstallments={editExtra.splitIntoTwoInstallments}
          onClose={() => setEditExtra(null)}
          onSuccess={() => {
            setEditExtra(null);
            onFeeModified?.();
          }}
        />
      )}

      {payingHead ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1220] p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-white">Record Payment</h4>
                <p className="text-xs text-white/60 mt-1">
                  {payingHead.label} • Due: ₹{payingHead.due.toLocaleString("en-IN")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !paymentSaving && setPayingHead(null)}
                className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                  placeholder="Enter amount"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Payment mode</label>
                <select
                  value={paymentForm.mode}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      mode: e.target.value as "CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS",
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                >
                  <option value="CASH">Cash</option>
                  <option value="ONLINE">Online</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="DD">DD (Demand Draft)</option>
                  <option value="OTHERS">Others</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">Payment date</label>
                <input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      paymentDate: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/60">UTR / Reference number</label>
                <input
                  value={paymentForm.referenceNo}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({
                      ...prev,
                      referenceNo: e.target.value,
                    }))
                  }
                  placeholder="Optional for cash, required for non-cash"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
            </div>

            {paymentError ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {paymentError}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !paymentSaving && setPayingHead(null)}
                disabled={paymentSaving}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitHeadPayment}
                disabled={paymentSaving}
                className="rounded-xl bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50"
              >
                {paymentSaving ? "Recording..." : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
