import type { FeePaymentReceiptData } from "../../../../pdf/FeePaymentReceiptTemplate";
import { formatResidencyTypeForDisplay } from "@/lib/students/residencyDisplay";
import type { TransactionDisplayRow } from "./feeTransactionsTypes";
import { formatPaymentMethod } from "./feeTransactionsHelpers";

export const simplifyFeeHeadName = (value?: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "Fee";
  const lower = raw.toLowerCase();
  if (lower.includes("tuition")) return "Tuition Fee";
  if (lower.includes("mess")) return "Mess Fee";
  if (lower.includes("hostel") || lower.includes("hostler") || lower.includes("boarding")) {
    return "Hostel Fee";
  }
  if (lower.includes("transport")) return "Transportation Fee";
  const cleaned = raw
    .replace(/\b\d+(st|nd|rd|th)\s*installment\b/gi, "")
    .replace(/\binstallment\b/gi, "")
    .replace(/\s*-\s*[\w\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || raw;
};

type ReceiptLine = {
  description: string;
  amount: number;
  paymentMethod: string;
  utrNo: string;
};

/** Merge same fee head + same payment method; keep separate rows when method differs (e.g. Cash vs Online). */
const mergeReceiptLinesByDescription = (lines: ReceiptLine[]): ReceiptLine[] => {
  const merged = new Map<
    string,
    { description: string; amount: number; paymentMethod: string; utrNos: Set<string> }
  >();

  for (const line of lines) {
    const key = `${line.description}::${line.paymentMethod}`;
    const existing = merged.get(key);
    if (existing) {
      existing.amount += line.amount;
      if (line.utrNo && line.utrNo !== "-") existing.utrNos.add(line.utrNo);
    } else {
      merged.set(key, {
        description: line.description,
        amount: line.amount,
        paymentMethod: line.paymentMethod,
        utrNos: new Set(line.utrNo && line.utrNo !== "-" ? [line.utrNo] : []),
      });
    }
  }

  return Array.from(merged.values()).map(({ description, amount, paymentMethod, utrNos }) => ({
    description,
    amount,
    paymentMethod,
    utrNo: utrNos.size === 0 ? "-" : utrNos.size === 1 ? [...utrNos][0]! : [...utrNos].join(", "),
  }));
};

export const buildReceiptDataFromTransactionRows = (
  selectedRows: TransactionDisplayRow[],
  transactionDate: string,
  generatedOn: string,
  context: {
    schoolBrand: { name: string; address: string; logo: string | null };
    studentName: string;
    admissionNumber: string;
    classDisplayName: string;
    parentName: string;
    motherName: string;
    residencyType: string;
    parentPhone: string;
  }
) => {
  const { schoolBrand, studentName, admissionNumber, classDisplayName, parentName, motherName, residencyType, parentPhone } =
    context;
  const rawLines = selectedRows.map((row) => {
    const currentRef =
      row.transactionId?.trim() && row.transactionId !== "N/A" ? row.transactionId.trim() : "-";
    return {
      description: simplifyFeeHeadName(row.feeTypeName),
      amount: row.amount,
      paymentMethod: formatPaymentMethod(row.method),
      utrNo: currentRef,
    };
  });
  const groupedLines = mergeReceiptLinesByDescription(rawLines);
  const finalTotal = groupedLines.reduce((s, l) => s + l.amount, 0);
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const receiptTitle =
    selectedRows.length === 1 &&
    (selectedRows[0].paymentId === "admission-fee" || selectedRows[0].paymentId === "application-fee")
      ? "Admission Receipt"
      : "Fee Receipt";
  return {
    schoolName: schoolBrand.name || "School",
    schoolLogo: schoolBrand.logo,
    schoolAddress: schoolBrand.address || "-",
    studentName: studentName || "Student",
    admissionNumber,
    className: classDisplayName || "-",
    academicYear: `${startYear}-${String(startYear + 1).slice(-2)}`,
    fatherName: parentName || "-",
    motherName: motherName || "-",
    residencyType: formatResidencyTypeForDisplay(residencyType || "Day Scholar"),
    parentName: parentName || "-",
    parentPhone: parentPhone || "-",
    transactionDate,
    generatedOn,
    lines: groupedLines,
    total: finalTotal,
    receiptTitle,
  } satisfies FeePaymentReceiptData;
};
