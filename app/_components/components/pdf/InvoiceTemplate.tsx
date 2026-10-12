import React, { forwardRef } from "react";
import { format } from "date-fns";
import { CheckCircle2, Building2, Phone } from "lucide-react";

export interface InvoiceData {
  studentName: string;
  studentClass: string;
  receiptNo: string;
  transactionId?: string;
  date: string | Date;
  amount: number;
  status: string;
  paymentMethod?: string;
}

interface InvoiceTemplateProps {
  invoiceData: InvoiceData | null;
}

const InvoiceTemplate = forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ invoiceData }, ref) => {
    if (!invoiceData) return null;

    const formattedDate = format(new Date(invoiceData.date), "dd MMMM yyyy, hh:mm a");

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
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 pb-6 mb-8" style={{ borderColor: "#e2e8f0" }}>
            <div className="flex items-center gap-4">
              <div 
                className="w-16 h-16 rounded-xl flex items-center justify-center font-bold text-3xl shadow-sm"
                style={{ backgroundColor: "#84cc16", color: "#ffffff" }}
              >
                T
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#1e293b" }}>
                  Timelly School
                </h1>
                <p className="text-sm font-medium" style={{ color: "#64748b" }}>
                  Excellence in Education
                </p>
              </div>
            </div>
            <div className="text-right flex flex-col items-end gap-1">
              <h2 className="text-2xl font-black uppercase tracking-widest" style={{ color: "#cbd5e1" }}>
                Receipt
              </h2>
              <div className="flex items-center text-xs mt-2 gap-4" style={{ color: "#64748b" }}>
                <div className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  <span>123 Education Lane, City</span>
                </div>
                <div className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  <span>+1 234 567 8900</span>
                </div>
              </div>
            </div>
          </div>

          {/* Info Section */}
          <div className="grid grid-cols-2 gap-12 mb-10">
            <div className="rounded-2xl p-6 border" style={{ backgroundColor: "#f8fafc", borderColor: "#f1f5f9" }}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "#94a3b8" }}>
                Billed To
              </h3>
              <p className="text-xl font-bold mb-1" style={{ color: "#1e293b" }}>
                {invoiceData.studentName}
              </p>
              <p className="text-sm font-medium" style={{ color: "#475569" }}>
                Class: {invoiceData.studentClass}
              </p>
            </div>
            <div className="rounded-2xl p-6 border flex flex-col justify-center" style={{ backgroundColor: "#f8fafc", borderColor: "#f1f5f9" }}>
              <div className="grid grid-cols-2 gap-y-4 gap-x-2">
                <div className="text-xs font-bold uppercase" style={{ color: "#94a3b8" }}>
                  Receipt No:
                </div>
                <div className="text-sm font-semibold text-right" style={{ color: "#1e293b" }}>
                  {invoiceData.receiptNo}
                </div>
                {invoiceData.transactionId && (
                  <>
                    <div className="text-xs font-bold uppercase" style={{ color: "#94a3b8" }}>
                      Txn ID:
                    </div>
                    <div className="text-sm font-semibold text-right truncate" style={{ color: "#1e293b" }}>
                      {invoiceData.transactionId}
                    </div>
                  </>
                )}
                <div className="text-xs font-bold uppercase" style={{ color: "#94a3b8" }}>
                  Date:
                </div>
                <div className="text-sm font-semibold text-right" style={{ color: "#1e293b" }}>
                  {formattedDate}
                </div>
              </div>
            </div>
          </div>

          {/* Table Details */}
          <div className="mb-10 rounded-2xl overflow-hidden border" style={{ borderColor: "#e2e8f0" }}>
            <table className="w-full text-sm text-left">
              <thead className="uppercase text-xs font-bold tracking-wider" style={{ backgroundColor: "#1e293b", color: "#ffffff" }}>
                <tr>
                  <th className="px-6 py-4 rounded-tl-xl">Description</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-right rounded-tr-xl">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ backgroundColor: "#ffffff", borderColor: "#f1f5f9" }}>
                <tr>
                  <td className="px-6 py-5 font-medium" style={{ color: "#1e293b" }}>
                    School Fees Payment
                  </td>
                  <td className="px-6 py-5 text-center">
                    <span 
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                      style={{ backgroundColor: "#d1fae5", color: "#047857" }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 color-[#047857] text-[#047857]" />
                      {invoiceData.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right font-bold" style={{ color: "#1e293b" }}>
                    ₹{invoiceData.amount.toLocaleString("en-IN")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer Total */}
          <div className="flex justify-end mb-16">
            <div className="w-1/2 rounded-2xl p-6 border" style={{ backgroundColor: "#f8fafc", borderColor: "#f1f5f9" }}>
              <div className="flex justify-between items-center mb-3 text-sm" style={{ color: "#475569" }}>
                <span className="font-semibold">Subtotal</span>
                <span>₹{invoiceData.amount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between items-center mb-4 text-sm" style={{ color: "#475569" }}>
                <span className="font-semibold">Tax (0%)</span>
                <span>₹0.00</span>
              </div>
              <div className="pt-4 border-t-2 flex justify-between items-center" style={{ borderColor: "#e2e8f0" }}>
                <span className="font-bold uppercase tracking-wider" style={{ color: "#1e293b" }}>
                  Total Paid
                </span>
                <span className="text-2xl font-black" style={{ color: "#65a30d" }}>
                  ₹{invoiceData.amount.toLocaleString("en-IN")}
                </span>
              </div>
            </div>
          </div>

          {/* Footer Details */}
          <div className="text-center text-xs font-semibold mt-auto pt-8 border-t flex flex-col gap-1" style={{ color: "#94a3b8", borderColor: "#f1f5f9" }}>
            <p>Thank you for your payment!</p>
            <p>
              This is a computer-generated receipt and does not require a physical
              signature.
            </p>
          </div>
        </div>
      </div>
    );
  }
);

InvoiceTemplate.displayName = "InvoiceTemplate";
export default InvoiceTemplate;
