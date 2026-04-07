import { Receipt, Download } from "lucide-react";
import { useState } from "react";

type Props = {
  fee?: {
    totalFee: number;
    amountPaid: number;
    remainingFee: number;
  } | null;
  payments?: Array<{
    id: string;
    amount: number;
    status: string;
    method: string;
    createdAt: string;
    transactionId: string | null;
    feeTypeName?: string;
    feeTypeAmount?: number;
  }>;
  studentName?: string;
  studentId?: string;
  admissionNumber?: string;
  applicationFee?: number | null;
  admissionFee?: number | null;
  studentCreatedAt?: string;
  tuitionFeeAmount?: number;
  installmentCount?: number;
  installmentDates?: string[];
  tuitionPaidAmount?: number;
};

export const FeeTransactions = ({
  fee,
  payments,
  studentName = "Student",
  studentId = "",
  admissionNumber = "",
  applicationFee,
  admissionFee,
  studentCreatedAt,
  tuitionFeeAmount = 0,
  installmentCount = 0,
  installmentDates = [],
  tuitionPaidAmount = 0,
}: Props) => {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const hasFee = fee && (fee.totalFee > 0 || fee.amountPaid > 0 || fee.remainingFee > 0);
  
  const basePayments = payments && payments.length > 0 ? [...payments] : [];
  
  if (admissionFee && admissionFee > 0) {
    basePayments.push({
      id: "admission-fee",
      amount: admissionFee,
      status: "Paid",
      method: "One-time",
      createdAt: studentCreatedAt || new Date().toISOString(),
      transactionId: "N/A",
      feeTypeName: "Admission Fee",
      feeTypeAmount: admissionFee
    });
  }
  
  if (applicationFee && applicationFee > 0) {
    basePayments.push({
      id: "application-fee",
      amount: applicationFee,
      status: "Paid",
      method: "One-time",
      createdAt: studentCreatedAt || new Date().toISOString(),
      transactionId: "N/A",
      feeTypeName: "Application Fee",
      feeTypeAmount: applicationFee
    });
  }

  // Sort by date descending
  const activePayments = basePayments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const totalPaid = hasFee ? fee!.amountPaid : 0;
  const total = hasFee ? fee!.amountPaid + fee!.remainingFee : 0;
  const hasAny = hasFee || activePayments.length > 0;
  const safeInstallmentCount = Number.isInteger(installmentCount) && installmentCount > 0 ? installmentCount : 0;
  const tuitionInstallmentAmount =
    safeInstallmentCount > 0 ? tuitionFeeAmount / safeInstallmentCount : 0;
  const installmentCards = Array.from({ length: safeInstallmentCount }, (_, idx) => {
    const installmentNo = idx + 1;
    const start = tuitionInstallmentAmount * idx;
    const paidForThis = Math.max(
      Math.min((tuitionPaidAmount || 0) - start, tuitionInstallmentAmount),
      0
    );
    const remainingForThis = Math.max(tuitionInstallmentAmount - paidForThis, 0);
    const dueDate = installmentDates[idx] || "";
    return {
      installmentNo,
      dueDate,
      total: tuitionInstallmentAmount,
      paid: paidForThis,
      remaining: remainingForThis,
    };
  });

  const handleDownloadReceipt = async (payment: typeof activePayments[0], copyType: "admin" | "parent") => {
    try {
      setDownloadingId(`${payment.id}-${copyType}`);
      const response = await fetch(
        `/api/student/receipt?paymentId=${payment.id}&studentId=${studentId}&studentName=${encodeURIComponent(studentName)}&admissionNumber=${encodeURIComponent(admissionNumber)}&copyType=${copyType}`,
        { credentials: "include" }
      );

      if (!response.ok) throw new Error("Failed to download receipt");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const copyLabel = copyType === "admin" ? "Admin" : "Parent";
      a.download = `Receipt_${admissionNumber}_${copyLabel}_${new Date(payment.createdAt).toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading receipt:", error);
      alert("Failed to download receipt. Please try again.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      id="student-profile-fees-section"
      className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl sm:rounded-[2rem] p-3 sm:p-6 mt-4 sm:mt-6 overflow-hidden min-w-0 scroll-mt-28 sm:scroll-mt-24"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 sm:mb-8">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Receipt className="w-5 h-5 text-lime-400 flex-shrink-0" /> Fee Details & Transactions
        </h3>
        {hasFee && (
          <div className="text-left sm:text-right">
            <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">FEES PAID / TOTAL</p>
            <p className="text-xl sm:text-2xl font-bold text-white">
              ₹{totalPaid.toLocaleString("en-IN")} <span className="text-gray-500">/ ₹{total.toLocaleString("en-IN")}</span>
            </p>
          </div>
        )}
      </div>
      {installmentCards.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">Tuition Installments</h4>
            <p className="text-xs text-gray-400">
              Tuition ₹{tuitionFeeAmount.toLocaleString("en-IN")} split into {safeInstallmentCount}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {installmentCards.map((it) => (
              <div key={it.installmentNo} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Installment {it.installmentNo}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Date: {it.dueDate || "Not set in Settings"}
                </p>
                <p className="text-sm text-white mt-2">
                  Total: ₹{it.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-lime-400">
                  Paid: ₹{it.paid.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </p>
                <p className="text-sm text-red-400">
                  Remaining: ₹{it.remaining.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasAny ? (
        <div className="py-8 text-center text-gray-500 text-sm">No fee records</div>
      ) : (
        <div className="overflow-x-auto overscroll-x-contain touch-pan-x -mx-1 px-1 sm:mx-0 sm:px-0 pb-1 rounded-lg">
          <table className="w-full text-left min-w-[720px]">
            <thead>
              <tr className="text-[11px] text-gray-400 font-bold tracking-wider uppercase border-b border-white/5">
                <th className="pb-4 font-medium">DATE</th>
                <th className="pb-4 font-medium">DESCRIPTION</th>
                <th className="pb-4 font-medium">FEE TYPE</th>
                <th className="pb-4 font-medium">METHOD</th>
                <th className="pb-4 font-medium">STATUS</th>
                <th className="pb-4 font-medium text-right">AMOUNT</th>
                <th className="pb-4 font-medium text-center">RECEIPT</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {activePayments.map((p) => (
                <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 sm:py-5 text-gray-400 whitespace-nowrap">
                    {new Date(p.createdAt).toISOString().slice(0, 10)}
                  </td>
                  <td className="py-4 sm:py-5 font-bold text-gray-100">Fee payment</td>
                  <td className="py-4 sm:py-5 text-gray-400">{p.feeTypeName || "-"}</td>
                  <td className="py-4 sm:py-5 text-gray-400">{p.method || "-"}</td>
                  <td className="py-4 sm:py-5">
                    <span className="bg-lime-400/20 text-lime-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase">
                      {p.status || "Paid"}
                    </span>
                  </td>
                  <td className="py-4 sm:py-5 text-right font-bold text-white whitespace-nowrap">
                    ₹{(typeof p.feeTypeAmount === "number" ? p.feeTypeAmount : p.amount).toLocaleString("en-IN")}
                  </td>
                  <td className="py-4 sm:py-5 text-center">
                    <div className="flex gap-2 justify-center items-center flex-wrap">
                      <button
                        onClick={() => handleDownloadReceipt(p, "admin")}
                        disabled={downloadingId === `${p.id}-admin`}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-600 disabled:cursor-not-allowed text-blue-400 disabled:text-gray-500 rounded text-xs font-semibold transition-colors"
                        title="Download Admin Copy"
                      >
                        <Download className="w-3 h-3" />
                        <span className="hidden sm:inline">Admin</span>
                      </button>
                      <button
                        onClick={() => handleDownloadReceipt(p, "parent")}
                        disabled={downloadingId === `${p.id}-parent`}
                        className="flex items-center gap-1 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 disabled:bg-gray-600 disabled:cursor-not-allowed text-green-400 disabled:text-gray-500 rounded text-xs font-semibold transition-colors"
                        title="Download Parent Copy"
                      >
                        <Download className="w-3 h-3" />
                        <span className="hidden sm:inline">Parent</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};