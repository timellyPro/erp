import * as XLSX from "xlsx";
import type { FeeRecord } from "../types";
import { formatRupee, roundRupee } from "@/lib/formatRupee";

export const toSheetRows = (rows: FeeRecord[]) =>
  rows.map((f) => {
    const classLabel = f.student.class
      ? `${f.student.class.name}${f.student.class.section ? `-${f.student.class.section}` : ""}`
      : "-";
    const status = f.remainingFee <= 0 ? "Paid" : "Pending";
    const discountAmount =
      typeof f.discountAmount === "number"
        ? roundRupee(f.discountAmount)
        : roundRupee(Math.max((f.totalFee || 0) - (f.finalFee || 0), 0));
    const pending = roundRupee(f.remainingFee);
    return {
      "Student Name": f.student.user?.name || "-",
      "Admission Email": f.student.user?.email || "-",
      Class: classLabel,
      "Fee Type": f.feeTypes
        ? `${f.feeTypes}${typeof f.feeTypeDueAmount === "number" ? ` (₹${formatRupee(f.feeTypeDueAmount)})` : ""}`
        : "-",
      "Total Fee": roundRupee(f.totalFee),
      "Discount %": roundRupee(f.discountPercent),
      "Discount Amount": discountAmount,
      "Final Fee": roundRupee(f.finalFee),
      Paid: roundRupee(f.amountPaid),
      Pending: pending,
      Status: status,
    };
  });

export const downloadExcel = (filename: string, rows: FeeRecord[]) => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(toSheetRows(rows));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Fee Records");
  XLSX.writeFile(workbook, filename);
};

export const downloadCsv = (filename: string, rows: Record<string, string | number>[]) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escapeCsvValue = (value: string | number | undefined) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const removeAdmissionEmailColumn = (rows: Record<string, string | number>[]) =>
  rows.map((row) => {
    const { "Admission Email": _omit, ...rest } = row;
    return rest;
  });
