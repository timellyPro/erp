import React, { forwardRef } from "react";
import { format } from "date-fns";

export interface FeePaymentReceiptData {
  schoolName: string;
  schoolLogo?: string | null;
  schoolAddress?: string;
  studentName: string;
  className: string;
  residencyType: string;
  parentName: string;
  parentPhone: string;
  createdAt: string | Date;
  /** Table rows (description + amount); total should match sum shown in footer. */
  lines: Array<{ description: string; amount: number }>;
  total: number;
  /** Defaults to "Fee Receipt"; use "Admission Receipt" for application/admission fee lines to match the admission tab. */
  receiptTitle?: string;
}

type Props = {
  data: FeePaymentReceiptData | null;
};

const formatMoney = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SingleReceipt = ({ data }: { data: FeePaymentReceiptData }) => {
  const formattedDate = format(new Date(data.createdAt), "dd MMMM yyyy, hh:mm a");

  return (
    <div
      className="p-8 font-sans flex flex-col"
      style={{
        width: "800px",
        height: "510px",
        backgroundColor: "#ffffff",
        color: "#000000",
        position: "relative",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        className="h-2 rounded-t-2xl -mt-8 -mx-8 mb-4 flex-shrink-0"
        style={{ background: "linear-gradient(90deg, #84cc16 0%, #10b981 45%, #06b6d4 100%)" }}
      />

      <div className="flex flex-col border-b-2 pb-3 mb-4 flex-shrink-0" style={{ borderColor: "#e2e8f0" }}>
        <div className="flex justify-between items-start w-full">
          <div className="flex gap-4 items-center">
            {data.schoolLogo ? (
              <img
                src={data.schoolLogo}
                alt="Logo"
                className="w-14 h-14 object-contain rounded-full border"
                style={{ borderColor: "#e2e8f0" }}
              />
            ) : (
              <div
                className="w-14 h-14 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-gray-400"
                style={{ borderColor: "#e2e8f0" }}
              >
                LOGO
              </div>
            )}
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight leading-tight" style={{ color: "#1e293b" }}>
                {data.schoolName || "School"}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                {data.schoolAddress || "-"}
              </p>
            </div>
          </div>
          <div className="text-right whitespace-nowrap pt-1">
            <p className="text-xs font-semibold" style={{ color: "#64748b" }}>
              {formattedDate}
            </p>
          </div>
        </div>
        <div className="text-center mt-2">
          <h2 className="text-xl font-black uppercase tracking-widest" style={{ color: "#475569" }}>
            {data.receiptTitle?.trim() || "Fee Receipt"}
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-4 flex-shrink-0">
        <div className="rounded-xl p-3 border" style={{ backgroundColor: "#f0fdf4", borderColor: "#dcfce7" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#16a34a" }}>
            Student Information
          </p>
          <div className="space-y-1.5 text-xs">
            <div>
              <span style={{ color: "#64748b" }}>Name:</span>{" "}
              <span className="font-semibold">{data.studentName}</span>
            </div>
            <div>
              <span style={{ color: "#64748b" }}>Class:</span>{" "}
              <span className="font-semibold">{data.className}</span>
            </div>
            <div>
              <span style={{ color: "#64748b" }}>Type:</span>{" "}
              <span className="font-semibold">{data.residencyType}</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl p-3 border" style={{ backgroundColor: "#f0f9ff", borderColor: "#dbeafe" }}>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#0284c7" }}>
            Parent Information
          </p>
          <div className="space-y-1.5 text-xs">
            <div>
              <span style={{ color: "#64748b" }}>Parent Name:</span>{" "}
              <span className="font-semibold">{data.parentName}</span>
            </div>
            {data.parentPhone && data.parentPhone !== "-" ? (
              <div>
                <span style={{ color: "#64748b" }}>Phone:</span>{" "}
                <span className="font-semibold">{data.parentPhone}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-2 rounded-xl overflow-hidden border flex-shrink-0" style={{ borderColor: "#e2e8f0" }}>
        <table className="w-full text-xs">
          <thead style={{ backgroundColor: "#1e293b", color: "#ffffff" }}>
            <tr className="uppercase text-[10px] tracking-wider">
              <th className="px-5 py-2.5 text-left">Description</th>
              <th className="px-5 py-2.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody style={{ backgroundColor: "#ffffff" }}>
            {data.lines.map((row, idx) => (
              <tr
                key={`${row.description}-${idx}`}
                className="border-b"
                style={{
                  borderColor: "#f1f5f9",
                  backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                }}
              >
                <td className="px-5 py-3">{row.description}</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatMoney(row.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot style={{ backgroundColor: "#f0fdf4" }}>
            <tr>
              <td className="px-5 py-2.5 font-bold uppercase text-[10px] tracking-wider">Total Paid</td>
              <td className="px-5 py-2.5 text-right font-black tabular-nums text-sm" style={{ color: "#65a30d" }}>
                {formatMoney(data.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        className="absolute bottom-3 left-0 right-0 text-center text-[10px] font-semibold pt-2 border-t flex flex-col gap-0.5 mx-8"
        style={{ color: "#94a3b8", borderColor: "#f1f5f9" }}
      >
        <p>This is a computer-generated receipt and does not require a physical signature.</p>
        <p>Powered by Timelly</p>
      </div>
    </div>
  );
};

const FeePaymentReceiptTemplate = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  if (!data) return null;

  return (
    <div style={{ position: "fixed", top: "-9999px", left: "-9999px", zIndex: -9999 }}>
      <div ref={ref} style={{ width: "800px", display: "flex", flexDirection: "column" }}>
        <SingleReceipt data={data} />
        <div style={{ width: "100%", borderTop: "2px dashed #cbd5e1", margin: "4px 0" }} />
        <SingleReceipt data={data} />
      </div>
    </div>
  );
});

FeePaymentReceiptTemplate.displayName = "FeePaymentReceiptTemplate";
export default FeePaymentReceiptTemplate;
