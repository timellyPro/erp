import type { TransactionItem } from "../../RefundModal";
import { isOfflinePaymentGateway } from "@/lib/fees/feePaymentGateway";

export function FeeTransactionsMobileList({
  transactions,
  onOpenStudent,
  onPrefetchStudent,
  onRefund,
}: {
  transactions: TransactionItem[];
  onOpenStudent: (studentId: string) => void;
  onPrefetchStudent: (studentId: string) => void;
  onRefund: (t: TransactionItem) => void;
}) {
  return (
    <div className="space-y-3 sm:hidden">
      {transactions.map((t) => (
        <div key={t.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
          <button
            type="button"
            className="text-left text-base font-semibold text-white underline-offset-2 hover:underline"
            onMouseEnter={() => onPrefetchStudent(t.student.id)}
            onClick={() => onOpenStudent(t.student.id)}
          >
            {t.student.user?.name || t.student.admissionNumber || "-"}
          </button>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Date</span>
              <span className="text-right text-white">
                {new Date(t.createdAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Class</span>
              <span className="text-right text-white">
                {t.student.class
                  ? `${t.student.class.name}${t.student.class.section ? `-${t.student.class.section}` : ""}`
                  : "-"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-gray-400">Gateway</span>
              <div className="text-right text-gray-300">
                <div>{t.gateway}</div>
                {t.hyperpgStatus ? (
                  <div className="text-xs text-gray-500">
                    {t.hyperpgStatus}
                    {typeof t.hyperpgStatusId === "number" ? ` (${t.hyperpgStatusId})` : ""}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Reference / UTR</span>
              <span className="text-right text-gray-300 break-all">
                {t.transactionId || "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Collected by</span>
              <span className="text-right text-gray-300">
                {isOfflinePaymentGateway(t.gateway)
                  ? t.collectedByName || "—"
                  : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Amount</span>
              <span className="text-emerald-400">₹{t.amount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-400">Refunded</span>
              {t.refundable < t.amount ? (
                <span className="text-amber-400">
                  ₹{(t.amount - t.refundable).toLocaleString()}
                </span>
              ) : (
                <span className="text-gray-500">-</span>
              )}
            </div>
            <div className="pt-2">
              {t.refundable > 0 ? (
                <button
                  onClick={() => onRefund(t)}
                  className="w-full rounded-lg bg-amber-500/20 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/30"
                >
                  Refund
                </button>
              ) : (
                <span className="text-xs text-gray-500">Full refund</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
