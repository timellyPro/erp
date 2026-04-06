import React, { forwardRef } from "react";
import { format } from "date-fns";

export interface AdmissionReceiptData {
  schoolName: string;
  schoolAddress?: string;
  applicationNo: string;
  studentName: string;
  className: string;
  gradeSought: string;
  boardingType: string;
  residencyType: string;
  parentName: string;
  parentPhone: string;
  createdAt: string | Date;
  applicationFee: number;
  admissionFee: number;
  total: number;
}

type Props = {
  data: AdmissionReceiptData | null;
};

const formatMoney = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdmissionReceiptTemplate = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  if (!data) return null;

  const formattedDate = format(new Date(data.createdAt), "dd MMMM yyyy, hh:mm a");

  return (
    <div style={{ position: "fixed", top: "-9999px", left: "-9999px", zIndex: -9999 }}>
      <div
        ref={ref}
        className="p-10 font-sans"
        style={{ width: "800px", minHeight: "1120px", backgroundColor: "#ffffff", color: "#000000" }}
      >
        <div
          className="h-3 rounded-t-2xl -mt-10 -mx-10 mb-6"
          style={{ background: "linear-gradient(90deg, #84cc16 0%, #10b981 45%, #06b6d4 100%)" }}
        />
        <div className="flex justify-between items-start border-b-2 pb-6 mb-8" style={{ borderColor: "#e2e8f0" }}>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#1e293b" }}>
              {data.schoolName || "School"}
            </h1>
            <p className="text-sm mt-1" style={{ color: "#64748b" }}>
              {data.schoolAddress || "-"}
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-black uppercase tracking-widest" style={{ color: "#94a3b8" }}>
              Admission Receipt
            </h2>
            <span
              className="inline-flex mt-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: "#ecfccb", color: "#4d7c0f", border: "1px solid #bef264" }}
            >
              Record Copy
            </span>
            <p className="text-sm font-medium mt-2" style={{ color: "#64748b" }}>
              {formattedDate}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="rounded-2xl p-5 border" style={{ backgroundColor: "#f0fdf4", borderColor: "#dcfce7" }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#16a34a" }}>Student Information</p>
            <div className="space-y-2 text-sm">
              <div><span style={{ color: "#64748b" }}>Name:</span> <span className="font-semibold">{data.studentName}</span></div>
              <div><span style={{ color: "#64748b" }}>Application No:</span> <span className="font-semibold">{data.applicationNo}</span></div>
              <div><span style={{ color: "#64748b" }}>Class:</span> <span className="font-semibold">{data.className}</span></div>
              <div><span style={{ color: "#64748b" }}>Grade:</span> <span className="font-semibold">{data.gradeSought}</span></div>
              <div><span style={{ color: "#64748b" }}>Boarding:</span> <span className="font-semibold">{data.boardingType}</span></div>
              <div><span style={{ color: "#64748b" }}>Residency:</span> <span className="font-semibold">{data.residencyType}</span></div>
            </div>
          </div>
          <div className="rounded-2xl p-5 border" style={{ backgroundColor: "#f0f9ff", borderColor: "#dbeafe" }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "#0284c7" }}>Parent Information</p>
            <div className="space-y-2 text-sm">
              <div><span style={{ color: "#64748b" }}>Parent Name:</span> <span className="font-semibold">{data.parentName}</span></div>
              <div><span style={{ color: "#64748b" }}>Parent Phone:</span> <span className="font-semibold">{data.parentPhone}</span></div>
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-2xl overflow-hidden border" style={{ borderColor: "#e2e8f0" }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "#1e293b", color: "#ffffff" }}>
              <tr className="uppercase text-xs tracking-wider">
                <th className="px-6 py-4 text-left">Description</th>
                <th className="px-6 py-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody style={{ backgroundColor: "#ffffff" }}>
              <tr className="border-b" style={{ borderColor: "#f1f5f9", backgroundColor: "#ffffff" }}>
                <td className="px-6 py-4">Application Fee</td>
                <td className="px-6 py-4 text-right font-semibold tabular-nums">{formatMoney(data.applicationFee)}</td>
              </tr>
              <tr className="border-b" style={{ borderColor: "#f1f5f9", backgroundColor: "#f8fafc" }}>
                <td className="px-6 py-4">Admission Fee</td>
                <td className="px-6 py-4 text-right font-semibold tabular-nums">{formatMoney(data.admissionFee)}</td>
              </tr>
            </tbody>
            <tfoot style={{ backgroundColor: "#f0fdf4" }}>
              <tr>
                <td className="px-6 py-4 font-bold uppercase text-xs tracking-wider">Total Paid</td>
                <td className="px-6 py-4 text-right font-black tabular-nums" style={{ color: "#65a30d" }}>
                  {formatMoney(data.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="text-center text-xs font-semibold mt-auto pt-8 border-t flex flex-col gap-1" style={{ color: "#94a3b8", borderColor: "#f1f5f9" }}>
          <p>This is a computer-generated receipt and does not require a physical signature.</p>
          <p>Powered by Timelly</p>
        </div>
      </div>
    </div>
  );
});

AdmissionReceiptTemplate.displayName = "AdmissionReceiptTemplate";
export default AdmissionReceiptTemplate;

