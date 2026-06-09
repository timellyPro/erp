"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSession } from "next-auth/react";
import {
  CreditCard,
  CheckCircle,
  AlertCircle,
  IndianRupee,
  Download,
  Loader2,
  Receipt,
  Clock,
} from "lucide-react";
import PageHeader from "../../common/PageHeader";
import ParentTimellyLoader from "../ParentTimellyLoader";
import {
  loadParentFees,
  peekParentFees,
  peekParentProfileShell,
  type ParentFeesPayload,
} from "@/lib/loadParentPortal";
import FeePaymentReceiptTemplate, {
  type FeePaymentReceiptData,
} from "../../pdf/FeePaymentReceiptTemplate";
import { currentAcademicYearLabel } from "@/lib/resolveSchoolBrand";
import { downloadParentPortalPdf } from "@/lib/downloadParentPortalPdf";
import { formatReceiptGeneratedDate } from "@/lib/receiptDates";

type DueHeadRow = {
  key: string;
  label: string;
  total: number;
  paid: number;
  due: number;
  status: { label: string; className: string };
};

function formatPaymentMethod(method?: string) {
  const m = String(method || "").trim().toUpperCase();
  if (!m) return "—";
  if (m === "OFFLINE" || m === "CASH" || m === "OFFLINE_CASH") return "Cash";
  if (m === "UPI" || m === "OFFLINE_UPI") return "UPI";
  if (m === "CHEQUE" || m === "OFFLINE_CHEQUE") return "Cheque";
  if (m === "DD" || m === "OFFLINE_DD") return "Demand draft";
  if (m === "ONLINE" || m === "OFFLINE_ONLINE") return "Online";
  if (m === "BANK_TRANSFER" || m === "OFFLINE_BANK_TRANSFER") return "Bank transfer";
  if (m === "CARD" || m === "OFFLINE_CARD") return "Card";
  if (m === "HYPERPG") return "Online gateway";
  if (m === "OFFLINE_OTHERS" || m === "OTHERS") return "Others";
  if (m.startsWith("OFFLINE_")) {
    return m
      .slice("OFFLINE_".length)
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return method || "—";
}

function formatRupee(n: number) {
  return `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
}

function headStatus(due: number, total: number) {
  if (total <= 0) return { label: "N/A", className: "bg-white/10 text-gray-400" };
  if (due <= 0) return { label: "Paid", className: "bg-emerald-500/20 text-emerald-400" };
  if (due < total) return { label: "Partial", className: "bg-amber-500/20 text-amber-400" };
  return { label: "Due", className: "bg-red-500/20 text-red-400" };
}

function DueHeadCard({ row }: { row: DueHeadRow }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white leading-snug">{row.label}</p>
        <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${row.status.className}`}>
          {row.status.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-black/20 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Total</p>
          <p className="text-sm font-semibold text-white mt-0.5">{formatRupee(row.total)}</p>
        </div>
        <div className="rounded-lg bg-black/20 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Paid</p>
          <p className="text-sm font-semibold text-emerald-400 mt-0.5">{formatRupee(row.paid)}</p>
        </div>
        <div className="rounded-lg bg-black/20 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Due</p>
          <p className="text-sm font-semibold text-lime-300 mt-0.5">{formatRupee(row.due)}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  valueClass = "text-white",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white/5 rounded-xl p-3 sm:p-4 border border-white/10 min-w-0">
      <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-lg sm:text-xl font-bold mt-1 truncate ${valueClass}`}>{value}</p>
    </div>
  );
}

export default function ParentFeesTab() {
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

  if (loading && !fee) {
    return (
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 sm:gap-6 px-2 sm:px-4 pb-6">
        <PageHeader title="Fees" subtitle="View fee dues and payment history" />
        <div className="flex-1 flex items-center justify-center min-h-[40vh]">
          <ParentTimellyLoader preset="fees" className="w-full max-w-2xl" />
        </div>
      </div>
    );
  }

  if (error || !fee) {
    return (
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 sm:gap-6 px-2 sm:px-4 pb-6">
        <PageHeader title="Fees" subtitle="View fee dues and payment history" />
        <div className="glass-card rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center gap-4 text-center">
          <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-amber-400" />
          <p className="text-white font-medium text-sm sm:text-base">
            {error || "Fee details not configured. Please contact the school admin."}
          </p>
        </div>
      </div>
    );
  }

  const progress = fee.finalFee > 0 ? Math.min((fee.amountPaid / fee.finalFee) * 100, 100) : 0;
  const totalDue = dueHeadRows.reduce((s, h) => s + h.due, 0);

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 sm:gap-6 px-2 sm:px-4 pb-6">
      <PageHeader title="Fees" subtitle="View all fee dues and payment history" compact />

      {/* Summary */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
          <IndianRupee className="w-5 h-5 text-lime-400 shrink-0" />
          Fee Summary
        </h3>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <SummaryStat label="Total Fee" value={formatRupee(fee.totalFee)} />
          <SummaryStat label="Final Fee" value={formatRupee(fee.finalFee)} valueClass="text-lime-400" />
          <SummaryStat label="Paid" value={formatRupee(fee.amountPaid)} valueClass="text-emerald-400" />
          <SummaryStat label="Remaining" value={formatRupee(fee.remainingFee)} />
        </div>

        <div>
          <div className="flex justify-between text-xs sm:text-sm mb-2 gap-2">
            <span className="text-gray-400">Payment progress</span>
            <span className="text-white font-medium text-right">
              {formatRupee(fee.amountPaid)} / {formatRupee(fee.finalFee)}
            </span>
          </div>
          <div className="h-2.5 sm:h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-lime-500 to-emerald-500 rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {fee.remainingFee <= 0 ? (
          <div className="flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/30">
            <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-white text-sm sm:text-base">All fees paid</p>
              <p className="text-xs sm:text-sm text-gray-400">No outstanding balance on your account.</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 p-3 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-medium text-white text-sm sm:text-base">
                Outstanding: {formatRupee(fee.remainingFee)}
              </p>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">
                Online payment is not enabled yet. Please pay at the school office — payments
                appear here once recorded by the admin.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Due heads */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
          <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-lime-400 shrink-0" />
            Fee dues by head
          </h3>
          <span className="text-xs sm:text-sm text-gray-400">
            Total due: <span className="text-white font-semibold">{formatRupee(totalDue)}</span>
          </span>
        </div>

        {dueHeadRows.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">No fee heads assigned yet.</p>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {dueHeadRows.map((row) => (
                <DueHeadCard key={row.key} row={row} />
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/5 text-left text-xs uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-3 font-medium">Fee head</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                    <th className="px-4 py-3 font-medium text-right">Paid</th>
                    <th className="px-4 py-3 font-medium text-right">Due</th>
                    <th className="px-4 py-3 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {dueHeadRows.map((row) => (
                    <tr key={row.key} className="bg-white/2 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-gray-200">{row.label}</td>
                      <td className="px-4 py-3 text-right text-white">{formatRupee(row.total)}</td>
                      <td className="px-4 py-3 text-right text-emerald-400">{formatRupee(row.paid)}</td>
                      <td className="px-4 py-3 text-right text-white font-medium">
                        {formatRupee(row.due)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block text-xs px-2.5 py-1 rounded-full ${row.status.className}`}
                        >
                          {row.status.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Payment history */}
      <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-lime-400 shrink-0" />
          Payment & refund history
        </h3>

        {transactions.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No payments or refunds recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {transactions.map((t) =>
              t.type === "payment" ? (
                <div
                  key={`pay-${t.id}`}
                  className="rounded-xl border border-white/10 bg-white/3 p-3 sm:p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base sm:text-lg font-semibold text-emerald-400">
                        +{formatRupee(t.amount)}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                        {new Date(t.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-[11px] sm:text-xs text-gray-500 mt-1 break-all">
                        {formatPaymentMethod(t.gateway)}
                        {t.transactionId ? ` · ${t.transactionId}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      <span
                        className={`text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full ${
                          t.status === "SUCCESS"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {t.status}
                      </span>
                      {t.status === "SUCCESS" && (
                        <button
                          type="button"
                          onClick={() => handleDownloadInvoice(t)}
                          disabled={generatingPdfId === t.id}
                          className="p-1.5 sm:p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                          title="Download receipt"
                        >
                          {generatingPdfId === t.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-lime-400" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {t.allocations && t.allocations.length > 0 && (
                    <div className="pt-2 border-t border-white/5">
                      <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider mb-2">
                        Applied to fee heads
                      </p>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2">
                        {t.allocations.map((a, i) => (
                          <span
                            key={`${t.id}-${i}`}
                            className="text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full bg-white/5 border border-white/10 text-gray-300"
                          >
                            {a.label}: {formatRupee(a.amount)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={`ref-${t.id}`}
                  className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 sm:p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-amber-400">
                      -{formatRupee(t.amount)} (Refund)
                    </p>
                    <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                      {new Date(t.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <span className="text-[10px] sm:text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 shrink-0">
                    Refunded
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </section>

      <FeePaymentReceiptTemplate
        ref={receiptRef}
        data={receiptData}
        singleCopy
        showSignature={false}
      />
    </div>
  );
}
