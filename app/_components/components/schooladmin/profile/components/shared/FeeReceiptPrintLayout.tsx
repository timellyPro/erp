import type { RefObject } from "react";
import { formatRupee } from "@/lib/formatRupee";

type ReceiptPayment = {
  id: string;
  amount: number;
  status: string;
  feeTypeName?: string;
  createdAt: string;
  collectedByName?: string | null;
};

/**
 * Hidden print-only receipt layout, rendered off-screen and captured via
 * generatePDF(contentRef, ...) in the parent. contentRef is the parent's own
 * useRef — passed straight through as a prop (a RefObject is just a plain
 * {current} object, no forwardRef needed) so the parent's existing
 * generatePDF call keeps working unchanged.
 */
export function FeeReceiptPrintLayout({
  contentRef,
  schoolName,
  studentName,
  admissionNumber,
  classDisplayName,
  totalFee,
  amountPaid,
  remainingAmount,
  paidPercentage,
  payments,
  feeBreakdown,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  schoolName: string | undefined;
  studentName: string | undefined;
  admissionNumber: string | undefined;
  classDisplayName: string | undefined;
  totalFee: number;
  amountPaid: number;
  remainingAmount: number;
  paidPercentage: number;
  payments: ReceiptPayment[];
  feeBreakdown: Map<string, { amount: number; paidAmount: number }>;
}) {
  const displaySchoolName = schoolName || "School Name";
  const displayStudentName = studentName || "Student";
  const displayAdmission = admissionNumber || "—";
  const displayClass = classDisplayName || "—";

  return (
    <div ref={contentRef} className="hidden">
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
              <p className="text-2xl font-bold text-green-600">₹{formatRupee(amountPaid)}</p>
            </div>
            <div>
              <p className="text-gray-600 text-sm">Amount Due</p>
              <p className="text-2xl font-bold text-red-600">₹{formatRupee(remainingAmount)}</p>
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
                  <th className="border border-gray-300 p-2 text-left font-semibold">Collected By</th>
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
                    <td className="border border-gray-300 p-2 text-sm">
                      {payment.collectedByName || "—"}
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
  );
}
