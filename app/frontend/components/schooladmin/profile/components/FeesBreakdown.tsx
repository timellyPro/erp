"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Zap, Settings, PlusCircle, Trash2, Pencil } from "lucide-react";
import { generatePDF } from "@/lib/pdfUtils";
import { ModifyFeeModal } from "./ModifyFeeModal";
import { AddExtraFeeModal } from "./AddExtraFeeModal";
import { EditExtraFeeModal } from "./EditExtraFeeModal";

type Props = {
  studentId: string;
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
    createdAt: string;
  }>;
  onFeeModified?: () => void;
};

export const FeesBreakdown = ({
  studentId,
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
  onFeeModified,
}: Props) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [showModifyFee, setShowModifyFee] = useState(false);
  const [showAddExtraFee, setShowAddExtraFee] = useState(false);
  const [editExtra, setEditExtra] = useState<{ id: string; name: string; amount: number } | null>(null);
  const [headsLoading, setHeadsLoading] = useState(false);
  const [deletingExtraId, setDeletingExtraId] = useState<string | null>(null);
  const [headCards, setHeadCards] = useState<
    Array<{
      key: string;
      label: string;
      amount: number;
      paid: number;
      due: number;
      extraFeeId?: string;
      canDeleteExtra?: boolean;
    }>
  >([]);
  const [headsTotalAmount, setHeadsTotalAmount] = useState<number | null>(null);
  const [headsRemainingAmount, setHeadsRemainingAmount] = useState<number | null>(null);

  // Calculate breakdown by fee type from payments
  const feeBreakdown = new Map<string, { amount: number; paidAmount: number }>();
  const resolveDisplayAmount = (payment: { amount: number; feeTypeAmount?: number }) => {
    const typeAmount = payment.feeTypeAmount;
    if (typeof typeAmount !== "number" || !Number.isFinite(typeAmount) || typeAmount <= 0) {
      return payment.amount;
    }
    // Ignore tiny paise-level values that can appear from gateway-side noise.
    if (payment.amount >= 1 && typeAmount < 1) {
      return payment.amount;
    }
    return typeAmount;
  };

  // Aggregate payment amounts by fee type
  for (const payment of payments) {
    const feeType = payment.feeTypeName || "Other Fees";
    const paidAmount = resolveDisplayAmount(payment);

    if (!feeBreakdown.has(feeType)) {
      feeBreakdown.set(feeType, { amount: paidAmount, paidAmount });
    } else {
      const existing = feeBreakdown.get(feeType)!;
      existing.amount += paidAmount;
      existing.paidAmount += paidAmount;
    }
  }

  // Calculate payment percentage
  const paidPercentage = totalFee > 0 ? (amountPaid / totalFee) * 100 : 0;
  const discountAmount = Math.max(baseTotalFee - totalFee, 0);
  const displayTotalAmount = headsTotalAmount ?? totalFee;
  const displayRemainingAmount = headsRemainingAmount ?? remainingFee;

  useEffect(() => {
    let cancelled = false;
    const loadHeads = async () => {
      try {
        setHeadsLoading(true);
        const res = await fetch(`/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) return;
        if (cancelled) return;

        const dueHeads = Array.isArray(data?.dueHeads) ? data.dueHeads : [];
        const normalized = dueHeads.map((h: Record<string, unknown>) => ({
          key: String(h.key),
          label: String(h.label || "Fee Head"),
          amount: Number(h.snapshotAmount) || 0,
          paid: Math.max((Number(h.snapshotAmount) || 0) - (Number(h.dueBefore) || 0), 0),
          due: Number(h.dueBefore) || 0,
          extraFeeId: typeof h.extraFeeId === "string" ? h.extraFeeId : undefined,
          canDeleteExtra: Boolean(h.canDeleteOnStudentProfile),
        }));
        setHeadCards(normalized);
        setHeadsTotalAmount(
          Number(data?.totalAmount) ||
            normalized.reduce((s: number, h: { amount: number }) => s + h.amount, 0)
        );
        setHeadsRemainingAmount(
          Number(data?.remainingFee) ||
            normalized.reduce((s: number, h: { due: number }) => s + h.due, 0)
        );
      } catch {
        if (!cancelled) {
          setHeadCards([]);
          setHeadsTotalAmount(null);
          setHeadsRemainingAmount(null);
        }
      } finally {
        if (!cancelled) setHeadsLoading(false);
      }
    };
    loadHeads();
    return () => {
      cancelled = true;
    };
  }, [studentId, amountPaid, remainingFee, totalFee]);

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
          <p className="text-2xl font-bold text-white mt-2">₹{displayTotalAmount.toLocaleString("en-IN")}</p>
          <p className="text-xs text-amber-300 mt-1 font-semibold">
            Pre-discount (structure + extras): ₹{baseTotalFee.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-amber-300 mt-1 font-semibold">
            Discount: ₹{discountAmount.toLocaleString("en-IN")}
          </p>
        </div>

        <div className="bg-lime-400/10 border border-lime-400/20 rounded-xl p-4">
          <p className="text-xs text-lime-300/70 uppercase tracking-widest font-bold">Amount Paid</p>
          <p className="text-2xl font-bold text-white mt-2">₹{amountPaid.toLocaleString("en-IN")}</p>
          <p className="text-xs text-lime-400 mt-1 font-semibold">{Math.round(paidPercentage)}% Paid</p>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-xs text-red-300/70 uppercase tracking-widest font-bold">Remaining / Due</p>
          <p className="text-2xl font-bold text-white mt-2">₹{displayRemainingAmount.toLocaleString("en-IN")}</p>
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
                  {h.canDeleteExtra && h.extraFeeId ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Edit this student extra fee"
                        disabled={deletingExtraId === h.extraFeeId}
                        onClick={() =>
                          setEditExtra({
                            id: h.extraFeeId!,
                            name: h.label,
                            amount: h.amount,
                          })
                        }
                        className="p-2 rounded-lg border border-white/15 text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Remove this student extra fee"
                        disabled={deletingExtraId === h.extraFeeId}
                        onClick={async () => {
                          if (
                            !confirm(
                              `Remove extra fee "${h.label}" from this student? Their total due will be reduced by this fee amount.`
                            )
                          ) {
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
                    </div>
                  ) : null}
                </div>
                <p className="text-lg font-bold text-white">₹{h.amount.toLocaleString("en-IN")}</p>
                <p className="text-xs text-lime-400 mt-auto">
                  Paid: ₹{h.paid.toLocaleString("en-IN")}
                </p>
                <p className="text-xs text-red-400">
                  Remaining: ₹{h.due.toLocaleString("en-IN")}
                </p>
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

      {/* Fee Type Breakdown Table */}
      {feeBreakdown.size > 0 ? (
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
              {Array.from(feeBreakdown.entries()).map(([feeType, data]) => {
                const remaining = data.amount - data.paidAmount;
                const percentage = data.amount > 0 ? (data.paidAmount / data.amount) * 100 : 0;
                return (
                  <tr
                    key={feeType}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-4 sm:py-5 font-semibold text-gray-100">{feeType}</td>
                    <td className="py-4 sm:py-5 text-right text-gray-400">
                      ₹{data.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-right font-semibold text-lime-400">
                      ₹{data.paidAmount.toLocaleString("en-IN")}
                    </td>
                    <td className="py-4 sm:py-5 text-right text-gray-400">
                      ₹{remaining.toLocaleString("en-IN")}
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
                <p className="text-2xl font-bold">₹{totalFee.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Amount Paid</p>
                <p className="text-2xl font-bold text-green-600">₹{amountPaid.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-gray-600 text-sm">Amount Due</p>
                <p className="text-2xl font-bold text-red-600">₹{remainingFee.toLocaleString("en-IN")}</p>
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
          onClose={() => setShowModifyFee(false)}
          onSuccess={() => {
            setShowModifyFee(false);
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

      {editExtra && (
        <EditExtraFeeModal
          extraFeeId={editExtra.id}
          initialName={editExtra.name}
          initialAmount={editExtra.amount}
          onClose={() => setEditExtra(null)}
          onSuccess={() => {
            setEditExtra(null);
            onFeeModified?.();
          }}
        />
      )}
    </div>
  );
};
