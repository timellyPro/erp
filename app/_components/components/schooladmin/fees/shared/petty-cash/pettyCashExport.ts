import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import type { PettyCashExpense, SchoolMeta } from "./pettyCashTypes";
import { fetchMySchool } from "@/lib/api/school";

export const toRows = (rows: PettyCashExpense[]) =>
  rows.map((row) => ({
    "Voucher No": `VCH-${row.voucherNo}`,
    Date: new Date(row.expenseDate).toLocaleDateString("en-IN"),
    "Head of Account": row.headOfAccount || row.itemName,
    "Type of Voucher": row.paymentType || "CASH",
    "Amount (INR)": Number(row.amount),
    Description: row.description || "",
  }));

export const downloadCsv = (filteredExpenses: PettyCashExpense[]) => {
  if (filteredExpenses.length === 0) {
    alert("No petty cash records to export.");
    return;
  }
  const rows = toRows(filteredExpenses);
  const headers = Object.keys(rows[0]);
  const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeCsv((row as Record<string, string | number>)[h])).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `petty-cash-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const downloadExcel = (filteredExpenses: PettyCashExpense[]) => {
  if (filteredExpenses.length === 0) {
    alert("No petty cash records to export.");
    return;
  }
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(toRows(filteredExpenses));
  XLSX.utils.book_append_sheet(workbook, worksheet, "Petty Cash");
  XLSX.writeFile(workbook, `petty-cash-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const getSchoolMeta = async (): Promise<SchoolMeta> => {
  try {
    const { data } = await fetchMySchool();
    return {
      name: data?.school?.name || "School",
      logoUrl: data?.school?.logoUrl || data?.school?.admins?.[0]?.photoUrl || null,
    };
  } catch {
    return { name: "School", logoUrl: null };
  }
};

const loadImageAsDataUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const downloadPdf = async (
  filteredExpenses: PettyCashExpense[],
  filteredTotalAmount: number
) => {
  if (filteredExpenses.length === 0) {
    alert("No petty cash records to export.");
    return;
  }

  const schoolMeta = await getSchoolMeta();
  const logoDataUrl = schoolMeta.logoUrl ? await loadImageAsDataUrl(schoolMeta.logoUrl) : null;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  doc.setFillColor(24, 31, 46);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setFillColor(132, 204, 22);
  doc.rect(0, 34, pageWidth, 2, "F");

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin, 7, 18, 18);
    } catch {
      // ignore logo rendering failures
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(schoolMeta.name || "School", logoDataUrl ? margin + 23 : margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Petty Cash Expense Report", logoDataUrl ? margin + 23 : margin, 20);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, logoDataUrl ? margin + 23 : margin, 26);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(`Total Expenses: INR ${filteredTotalAmount.toLocaleString()}`, pageWidth - margin, 20, { align: "right" });
  doc.text(`Entries: ${filteredExpenses.length}`, pageWidth - margin, 26, { align: "right" });

  let y = 44;
  const headers = ["Date", "Head of Account", "Description", "Voucher No", "Type", "Amount (INR)"];
  const colWidths = [24, 46, 52, 24, 18, 22];
  const headerRowHeight = 7;
  const minDataRowHeight = 7;
  const cellTopPadMm = 4.8;

  const drawHeader = () => {
    doc.setFillColor(132, 204, 22);
    doc.rect(margin, y, pageWidth - margin * 2, headerRowHeight, "F");
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    let x = margin + 1.5;
    headers.forEach((h, idx) => {
      doc.text(h, x, y + 4.8);
      x += colWidths[idx];
    });
    y += headerRowHeight;
  };

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.8);

  const lineHeightMm =
    (typeof doc.getLineHeightFactor === "function" ? doc.getLineHeightFactor() : 1.15) *
    doc.getFontSize() *
    0.352778;

  for (let i = 0; i < filteredExpenses.length; i += 1) {
    const row = filteredExpenses[i];
    const dateStr = new Date(row.expenseDate).toLocaleDateString("en-IN");
    const headStr = String(row.headOfAccount || row.itemName);
    const descStr = String(row.description || "-");
    const voucherStr = String(row.voucherNo);
    const typeStr = String(row.paymentType || "CASH");
    const amountStr = `INR ${Number(row.amount).toLocaleString()}`;

    const headLines = doc.splitTextToSize(headStr, colWidths[1] - 2);
    const descLines = doc.splitTextToSize(descStr, colWidths[2] - 2);
    const maxWrapLines = Math.max(1, headLines.length, descLines.length);
    const rowHeight = Math.max(minDataRowHeight, cellTopPadMm + maxWrapLines * lineHeightMm + 1);

    if (y + rowHeight > pageHeight - 16) {
      doc.addPage();
      y = 14;
      drawHeader();
    }

    if (i % 2 === 0) {
      doc.setFillColor(246, 247, 250);
      doc.rect(margin, y, pageWidth - margin * 2, rowHeight, "F");
    }

    doc.setTextColor(30, 30, 30);
    let x = margin + 1.5;

    doc.text(dateStr, x, y + cellTopPadMm, { maxWidth: colWidths[0] - 2 });
    x += colWidths[0];

    doc.text(headLines, x, y + cellTopPadMm);
    x += colWidths[1];

    doc.text(descLines, x, y + cellTopPadMm);
    x += colWidths[2];

    doc.text(voucherStr, x, y + cellTopPadMm, { maxWidth: colWidths[3] - 2 });
    x += colWidths[3];

    doc.text(typeStr, x, y + cellTopPadMm, { maxWidth: colWidths[4] - 2 });
    x += colWidths[4];

    doc.text(amountStr, x, y + cellTopPadMm, { maxWidth: colWidths[5] - 2 });

    y += rowHeight;
  }

  doc.save(`petty-cash-${new Date().toISOString().slice(0, 10)}.pdf`);
};
