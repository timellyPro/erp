import type { TransactionItem } from "../../RefundModal";
import { isOfflinePaymentGateway } from "@/lib/fees/feePaymentGateway";

export function FeeTransactionsTable({
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
    <div className="-mx-4 hidden overflow-x-auto px-4 sm:block sm:mx-0 sm:px-0">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="text-left text-gray-400 border-b border-white/10">
            <th className="pb-3 font-medium">Date</th>
            <th className="pb-3 font-medium">Student</th>
            <th className="pb-3 font-medium">Class</th>
            <th className="pb-3 font-medium">Gateway</th>
            <th className="pb-3 font-medium">Collected by</th>
            <th className="pb-3 font-medium">Reference No / UTR</th>
            <th className="pb-3 font-medium">Amount</th>
            <th className="pb-3 font-medium">Refunded</th>
            <th className="pb-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr
              key={t.id}
              className="border-b border-white/5 last:border-0 hover:bg-white/2"
            >
              <td className="py-3 text-gray-400 whitespace-nowrap">
                {new Date(t.createdAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </td>
              <td
                className="py-3 text-white font-medium cursor-pointer select-none underline-offset-2 hover:underline"
                title="Double-click to open student fee details"
                onMouseEnter={() => onPrefetchStudent(t.student.id)}
                onDoubleClick={() => onOpenStudent(t.student.id)}
              >
                {t.student.user?.name || t.student.admissionNumber || "-"}
              </td>
              <td className="py-3 text-gray-400">
                {t.student.class
                  ? `${t.student.class.name}${t.student.class.section ? `-${t.student.class.section}` : ""}`
                  : "-"}
              </td>
              <td className="py-3 text-gray-400">
                <div className="flex flex-col">
                  <span>{t.gateway}</span>
                  {t.hyperpgStatus ? (
                    <span className="text-xs text-gray-500">
                      {t.hyperpgStatus}
                      {typeof t.hyperpgStatusId === "number" ? ` (${t.hyperpgStatusId})` : ""}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="py-3 text-gray-400">
                {isOfflinePaymentGateway(t.gateway) ? t.collectedByName || "—" : "—"}
              </td>
              <td className="py-3 text-gray-300 break-all">
                {t.transactionId || "-"}
              </td>
              <td className="py-3 text-emerald-400">₹{t.amount.toLocaleString()}</td>
              <td className="py-3">
                {t.refundable < t.amount ? (
                  <span className="text-amber-400">
                    ₹{(t.amount - t.refundable).toLocaleString()}
                  </span>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </td>
              <td className="py-3 text-right">
                {t.refundable > 0 ? (
                  <button
                    onClick={() => onRefund(t)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-medium"
                  >
                    Refund
                  </button>
                ) : (
                  <span className="text-gray-500 text-xs">Full refund</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
