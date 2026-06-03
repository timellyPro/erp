import React, { forwardRef } from "react";
import { format } from "date-fns";

export interface FeePaymentReceiptData {
  schoolName: string;
  schoolLogo?: string | null;
  schoolAddress?: string;
  studentName: string;
  admissionNumber?: string;
  className: string;
  academicYear?: string;
  fatherName?: string;
  motherName?: string;
  residencyType: string;
  parentName: string;
  parentPhone: string;
  createdAt: string | Date;
  lines: Array<{ description: string; amount: number; paymentMethod?: string; utrNo?: string }>;
  total: number;
  receiptTitle?: string;
}

type Props = {
  data: FeePaymentReceiptData | null;
};

const numberToWords = (value: number) => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const under1000 = (n: number): string => {
    let out = "";
    if (n >= 100) {
      out += `${ones[Math.floor(n / 100)]} Hundred `;
      n %= 100;
    }
    if (n >= 20) {
      out += `${tens[Math.floor(n / 10)]} `;
      n %= 10;
    }
    if (n > 0) out += `${ones[n]} `;
    return out.trim();
  };
  const n = Math.floor(Math.max(0, value));
  if (n === 0) return "Zero only";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${under1000(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (rest) parts.push(under1000(rest));
  return `${parts.join(" ")} only`;
};

const SingleReceipt = ({ data }: { data: FeePaymentReceiptData }) => {
  const formattedDate = format(new Date(data.createdAt), "dd-MM-yyyy");

  return (
    <div
      className="p-6 pb-12 font-sans flex flex-col"
      style={{
        width: "800px",
        minHeight: "510px",
        backgroundColor: "#ffffff",
        color: "#000000",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ opacity: 0.06 }}
      >
        <img
          src={data.schoolLogo || "/timelylogo.webp"}
          alt="watermark"
          className="w-48 h-48 object-contain"
        />
      </div>

      <div className="border-b pb-2 mb-3" style={{ borderColor: "#000" }}>
        <div className="flex items-center justify-center gap-3">
          {data.schoolLogo ? (
            <img src={data.schoolLogo} alt="Logo" className="w-12 h-12 object-contain rounded-full border" style={{ borderColor: "#000" }} />
          ) : (
            <div className="w-12 h-12 rounded-full border flex items-center justify-center text-[9px] font-bold" style={{ borderColor: "#000" }}>
              LOGO
            </div>
          )}
          <div className="text-center">
            <h1 className="text-[28px] font-bold leading-tight tracking-wide">{data.schoolName || "School"}</h1>
            <p className="text-xs leading-tight">{data.schoolAddress || "-"}</p>
            <h2 className="text-sm font-semibold mt-1">{data.receiptTitle?.trim() || "Fee Receipt"}</h2>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-3 text-xs">
        <div className="space-y-1">
          <div className="font-semibold">Receipt To</div>
          <div><span className="font-semibold">Student Name:</span> {data.studentName}</div>
          <div><span className="font-semibold">Admission No.:</span> {data.admissionNumber || "-"}</div>
          <div><span className="font-semibold">Class:</span> {data.className}</div>
          <div><span className="font-semibold">Academic Year:</span> {data.academicYear || "-"}</div>
        </div>
        <div className="space-y-1">
          <div><span className="font-semibold">Father Name:</span> {data.fatherName || data.parentName || "-"}</div>
          <div><span className="font-semibold">Mother Name:</span> {data.motherName || "-"}</div>
          <div><span className="font-semibold">Receipt Date:</span> {formattedDate}</div>
          <div><span className="font-semibold">Phone:</span> {data.parentPhone || "-"}</div>
        </div>
      </div>

      <div className="mb-2 rounded-sm overflow-hidden border" style={{ borderColor: "#000" }}>
        <table className="w-full text-xs">
          <thead>
            <tr className="uppercase text-[10px] tracking-wider border-b" style={{ borderColor: "#000" }}>
              <th className="px-3 py-2 text-left">Sl No.</th>
              <th className="px-3 py-2 text-left">Particulars</th>
              <th className="px-3 py-2 text-left">Payment Method</th>
              <th className="px-3 py-2 text-left">UTR / Ref</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((row, idx) => (
              <tr key={`${row.description}-${idx}`} className="border-b" style={{ borderColor: "#000" }}>
                <td className="px-3 py-2 text-center">{idx + 1}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2">{row.paymentMethod || "-"}</td>
                <td className="px-3 py-2">{row.utrNo || "-"}</td>
                <td className="px-3 py-2 text-right font-semibold">Rs. {Number(row.amount || 0).toLocaleString("en-IN")}.00</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-3 py-2 font-semibold" colSpan={4}>
                Total in Words: {numberToWords(data.total)}
              </td>
              <td className="px-3 py-2 text-right font-bold">
                Total: Rs.{Number(data.total || 0).toLocaleString("en-IN")}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-4 flex items-end justify-end text-xs">
        <div className="text-xs font-semibold">
          <div className="border-t pt-1 min-w-[140px] text-center" style={{ borderColor: "#000" }}>
            Authorised Signature
          </div>
        </div>
      </div>

      <div
        className="absolute bottom-2 left-0 right-0 text-center text-[11px]"
        style={{ fontWeight: 400 }}
      >
        Powered by Timelly
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
        <div style={{ width: "100%", borderTop: "1px dashed #555", margin: "3px 0" }} />
        <SingleReceipt data={data} />
      </div>
    </div>
  );
});

FeePaymentReceiptTemplate.displayName = "FeePaymentReceiptTemplate";
export default FeePaymentReceiptTemplate;
