import React, { forwardRef } from "react";
import { format } from "date-fns";
import { ParentPortalDocumentShell, ParentPortalPdfMount } from "./ParentPortalDocumentShell";

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
  singleCopy?: boolean;
  showSignature?: boolean;
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

const SingleReceipt = ({
  data,
  showSignature = true,
}: {
  data: FeePaymentReceiptData;
  showSignature?: boolean;
}) => {
  const formattedDate = format(new Date(data.createdAt), "dd-MM-yyyy");

  return (
    <ParentPortalDocumentShell
      brand={{
        schoolName: data.schoolName,
        schoolLogo: data.schoolLogo,
        schoolAddress: data.schoolAddress,
      }}
      documentTitle={data.receiptTitle?.trim() || "Fee Receipt"}
      generatedAt={data.createdAt}
      minHeight={510}
      student={{
        studentName: data.studentName,
        className: data.className,
        admissionNumber: data.admissionNumber,
        academicYear: data.academicYear,
        rightRows: [
          { label: "Father Name", value: data.fatherName || data.parentName || "-" },
          { label: "Mother Name", value: data.motherName || "-" },
          { label: "Receipt Date", value: formattedDate },
          { label: "Phone", value: data.parentPhone || "-" },
        ],
      }}
    >
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
                <td className="px-3 py-2 text-right font-semibold">
                  Rs. {Number(row.amount || 0).toLocaleString("en-IN")}.00
                </td>
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

      {showSignature ? (
        <div className="mt-4 flex items-end justify-end text-xs">
          <div className="text-xs font-semibold">
            <div className="border-t pt-1 min-w-[140px] text-center" style={{ borderColor: "#000" }}>
              Authorised Signature
            </div>
          </div>
        </div>
      ) : null}
    </ParentPortalDocumentShell>
  );
};

const FeePaymentReceiptTemplate = forwardRef<HTMLDivElement, Props>(
  ({ data, singleCopy = false, showSignature = true }, ref) => {
    if (!data) {
      return (
        <ParentPortalPdfMount ref={ref}>
          <div style={{ width: "800px", minHeight: "1px", backgroundColor: "#ffffff" }} />
        </ParentPortalPdfMount>
      );
    }
    return (
      <ParentPortalPdfMount ref={ref}>
        <SingleReceipt data={data} showSignature={showSignature} />
        {!singleCopy ? (
          <>
            <div style={{ width: "100%", borderTop: "1px dashed #555", margin: "3px 0" }} />
            <SingleReceipt data={data} showSignature={showSignature} />
          </>
        ) : null}
      </ParentPortalPdfMount>
    );
  }
);

FeePaymentReceiptTemplate.displayName = "FeePaymentReceiptTemplate";
export default FeePaymentReceiptTemplate;
