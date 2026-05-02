import React, { forwardRef } from "react";
import { format } from "date-fns";

export interface InvoiceData {
  /** School branding */
  schoolName: string;
  schoolAddress?: string;
  schoolLogoUrl?: string | null;
  /** Student */
  studentName: string;
  studentClass: string;
  studentAddress?: string;
  admissionNumber?: string;
  receiptNo: string;
  transactionId?: string;
  date: string | Date;
  amount: number;
  status: string;
  paymentMethod?: string;
  /** Fee heads paid in this transaction (tuition, development fee, etc.) */
  feeHeadLines: Array<{ label: string; amount: number }>;
  /** HyperPG / online rows */
  onlinePaymentDetails?: Array<{ label: string; value: string }>;
}

interface InvoiceTemplateProps {
  invoiceData: InvoiceData | null;
}

const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ invoiceData }, ref) => {
    if (!invoiceData) return null;

    const formattedDate = format(new Date(invoiceData.date), "dd MMMM yyyy, hh:mm a");
    const schoolInitial = (invoiceData.schoolName || "S").trim().charAt(0).toUpperCase();
    const addrLine = [invoiceData.schoolAddress].filter(Boolean).join(" ").trim();

    return (
      <div
        style={{
          position: "fixed",
          top: "-9999px",
          left: "-9999px",
          zIndex: -9999,
        }}
      >
        <div
          ref={ref}
          className="p-10 font-sans"
          style={{ width: "800px", minHeight: "1000px", backgroundColor: "#ffffff", color: "#000000" }}
        >
          {/* Header — school logo + name + address */}
          <div className="flex justify-between items-start border-b-2 pb-6 mb-8" style={{ borderColor: "#e2e8f0" }}>
            <div className="flex items-center gap-4">
              {invoiceData.schoolLogoUrl ? (
                <img
                  src={invoiceData.schoolLogoUrl}
                  alt=""
                  crossOrigin="anonymous"
                  className="w-16 h-16 rounded-xl object-contain border shrink-0"
                  style={{ borderColor: "#e2e8f0" }}
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center font-bold text-3xl shadow-sm shrink-0"
                  style={{ backgroundColor: "#84cc16", color: "#ffffff" }}
                >
                  {schoolInitial}
                </div>
              )}
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#1e293b" }}>
                  {invoiceData.schoolName || "School"}
                </h1>
                <p className="text-sm font-medium mt-1" style={{ color: "#64748b" }}>
                  Fee invoice / receipt
                </p>
                {addrLine ? (
                  <p className="text-xs mt-2 max-w-md leading-relaxed" style={{ color: "#64748b" }}>
                    {addrLine}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1 shrink-0">
              <h2 className="text-2xl font-black uppercase tracking-widest" style={{ color: "#cbd5e1" }}>
                Receipt
              </h2>
            </div>
          </div>

          {/* Student + receipt meta */}
          <div className="grid grid-cols-2 gap-12 mb-10">
            <div className="rounded-2xl p-6 border" style={{ backgroundColor: "#f8fafc", borderColor: "#f1f5f9" }}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "#94a3b8" }}>
                Student
              </h3>
              <p className="text-xl font-bold mb-1" style={{ color: "#1e293b" }}>
                {invoiceData.studentName}
              </p>
              <p className="text-sm font-medium mb-1" style={{ color: "#475569" }}>
                Class: {invoiceData.studentClass}
              </p>
              {invoiceData.admissionNumber?.trim() ? (
                <p className="text-sm font-medium mb-1" style={{ color: "#475569" }}>
                  Admission no.: {invoiceData.admissionNumber.trim()}
                </p>
              ) : null}
              {invoiceData.studentAddress?.trim() ? (
                <p className="text-xs mt-2 leading-relaxed" style={{ color: "#64748b" }}>
                  Address: {invoiceData.studentAddress.trim()}
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl p-6 border flex flex-col justify-center" style={{ backgroundColor: "#f8fafc", borderColor: "#f1f5f9" }}>
              <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                <div className="text-xs font-bold uppercase" style={{ color: "#94a3b8" }}>
                  Receipt No:
                </div>
                <div className="text-sm font-semibold text-right" style={{ color: "#1e293b" }}>
                  {invoiceData.receiptNo}
                </div>
                {invoiceData.transactionId ? (
                  <>
                    <div className="text-xs font-bold uppercase" style={{ color: "#94a3b8" }}>
                      Txn / Order ref:
                    </div>
                    <div className="text-sm font-semibold text-right break-all" style={{ color: "#1e293b" }}>
                      {invoiceData.transactionId}
                    </div>
                  </>
                ) : null}
                <div className="text-xs font-bold uppercase" style={{ color: "#94a3b8" }}>
                  Date:
                </div>
                <div className="text-sm font-semibold text-right" style={{ color: "#1e293b" }}>
                  {formattedDate}
                </div>
                {invoiceData.paymentMethod ? (
                  <>
                    <div className="text-xs font-bold uppercase" style={{ color: "#94a3b8" }}>
                      Method:
                    </div>
                    <div className="text-sm font-semibold text-right truncate" style={{ color: "#1e293b" }}>
                      {invoiceData.paymentMethod}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {invoiceData.onlinePaymentDetails && invoiceData.onlinePaymentDetails.length > 0 ? (
            <div className="mb-8 rounded-2xl border p-5" style={{ borderColor: "#cbd5e1", backgroundColor: "#f8fafc" }}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#334155" }}>
                Online payment (HyperPG)
              </h3>
              <div className="space-y-2 text-xs">
                {invoiceData.onlinePaymentDetails.map((row, i) => (
                  <div
                    key={`${row.label}-${i}`}
                    className="flex justify-between gap-4 border-b border-slate-200/80 pb-2 last:border-0 last:pb-0"
                  >
                    <span style={{ color: "#64748b" }}>{row.label}</span>
                    <span className="font-mono font-semibold text-right break-all" style={{ color: "#0f172a" }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Fee heads */}
          <div className="mb-10 rounded-2xl overflow-hidden border" style={{ borderColor: "#e2e8f0" }}>
            <table className="w-full text-sm text-left">
              <thead className="uppercase text-xs font-bold tracking-wider" style={{ backgroundColor: "#1e293b", color: "#ffffff" }}>
                <tr>
                  <th className="px-6 py-4 rounded-tl-xl">Fee head / description</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right rounded-tr-xl">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ backgroundColor: "#ffffff", borderColor: "#f1f5f9" }}>
                {invoiceData.feeHeadLines.map((row, idx) => (
                  <tr key={`${row.label}-${idx}`}>
                    <td className="px-6 py-4 font-medium" style={{ color: "#1e293b" }}>
                      {row.label}
                    </td>
                    <td className="px-6 py-4 text-center text-xs font-semibold" style={{ color: "#047857" }}>
                      {invoiceData.status}
                    </td>
                    <td className="px-6 py-4 text-right font-bold tabular-nums" style={{ color: "#1e293b" }}>
                      ₹{Number(row.amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mb-16">
            <div className="w-1/2 rounded-2xl p-6 border" style={{ backgroundColor: "#f8fafc", borderColor: "#f1f5f9" }}>
              <div className="pt-2 border-t-2 flex justify-between items-center" style={{ borderColor: "#e2e8f0" }}>
                <span className="font-bold uppercase tracking-wider" style={{ color: "#1e293b" }}>
                  Total paid
                </span>
                <span className="text-2xl font-black" style={{ color: "#65a30d" }}>
                  ₹{invoiceData.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="text-center text-xs font-semibold mt-auto pt-8 border-t flex flex-col gap-1" style={{ color: "#94a3b8", borderColor: "#f1f5f9" }}>
            <p>Thank you for your payment.</p>
            <p>This is a computer-generated receipt and does not require a physical signature.</p>
            <p>Powered by Timelly</p>
          </div>
        </div>
      </div>
    );
  }
);

InvoiceTemplate.displayName = "InvoiceTemplate";
export default InvoiceTemplate;
