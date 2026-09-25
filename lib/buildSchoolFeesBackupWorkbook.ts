import ExcelJS from "exceljs";
import { buildDayReportSummaryModel, formatStudentClassForReport } from "@/lib/feeDayReportExcel";
import { feeReportColumnFromGateway } from "@/lib/feePaymentGateway";
import { buildFeeDueReportWorkbook } from "@/lib/feeDueReportExcel";
import type { FeeDueReportPayload, FeeDueReportRow } from "@/lib/feeDueReportCompute";
import { roundRupee } from "@/lib/formatRupee";
import type { SchoolFeesBackupData, SchoolFeesBackupStudentFeeRow } from "@/lib/loadSchoolFeesBackupData";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFBFBFBF" } },
  left: { style: "thin", color: { argb: "FFBFBFBF" } },
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  right: { style: "thin", color: { argb: "FFBFBFBF" } },
};

function feeHeadsSummaryText(row: FeeDueReportRow, payload: FeeDueReportPayload): string {
  return payload.groups
    .map((g) => {
      const c = row.cellsByGroupId[g.id];
      if (!c || (c.fee === 0 && c.concession === 0 && c.paid === 0 && c.due === 0)) return null;
      return `${g.label}: Fee ₹${roundRupee(c.fee)}, Concession ₹${roundRupee(c.concession)}, Paid ₹${roundRupee(c.paid)}, Due ₹${roundRupee(c.due)}`;
    })
    .filter(Boolean)
    .join(" | ");
}

function indexDueRowByAdmission(payload: FeeDueReportPayload): Map<string, FeeDueReportRow> {
  const map = new Map<string, FeeDueReportRow>();
  for (const row of payload.rows) {
    if (row.admissionNo) map.set(row.admissionNo, row);
  }
  return map;
}

function transactionsByAdmission(data: SchoolFeesBackupData): Map<string, typeof data.transactions> {
  const map = new Map<string, typeof data.transactions>();
  for (const tx of data.transactions) {
    const key = (tx.student?.admissionNumber || "").trim();
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(tx);
    map.set(key, list);
  }
  return map;
}

function discountsByAdmission(data: SchoolFeesBackupData) {
  const map = new Map<string, typeof data.discounts>();
  for (const d of data.discounts) {
    const list = map.get(d.admissionNumber) ?? [];
    list.push(d);
    map.set(d.admissionNumber, list);
  }
  return map;
}

function formatFeeHeadAllocations(tx: SchoolFeesBackupData["transactions"][number]): string {
  if (Array.isArray(tx.feeAllocations) && tx.feeAllocations.length > 0) {
    return tx.feeAllocations.map((a) => `${a.name}: ₹${roundRupee(a.amount)}`).join("; ");
  }
  return tx.feeTypeName || "-";
}

function studentClassLabel(row: SchoolFeesBackupStudentFeeRow): string {
  if (!row.className) return "-";
  return formatStudentClassForReport({ name: row.className, section: row.section });
}

function discountClassLabel(row: SchoolFeesBackupData["discounts"][number]): string {
  return formatStudentClassForReport({ name: row.className, section: row.section });
}

function discountDisplayDate(row: SchoolFeesBackupData["discounts"][number]): string {
  return formatDate(row.reviewedAt ?? row.createdAt);
}

function discountRemarkText(row: SchoolFeesBackupData["discounts"][number]): string {
  const parts = [row.discountRemarks, row.reviewRemarks].filter((t) => t && t.trim());
  if (row.discountFeeHeadLabel?.trim()) {
    parts.unshift(`Head: ${row.discountFeeHeadLabel.trim()}`);
  }
  return parts.join(" | ") || "-";
}

function discountHowGivenText(row: SchoolFeesBackupData["discounts"][number]): string {
  if (row.source === "APPLIED_ON_RECORD") {
    return "Direct apply on student fee (legacy / no approval record)";
  }
  if (row.status === "PENDING") {
    return row.requestedByName ? `Requested by ${row.requestedByName}` : "Pending approval";
  }
  if (row.status === "REJECTED") {
    const by = row.reviewedByName ? `Rejected by ${row.reviewedByName}` : "Rejected";
    return row.requestedByName ? `Requested by ${row.requestedByName} | ${by}` : by;
  }
  if (row.reviewedByName && row.requestedByName) {
    return `Requested by ${row.requestedByName} | Approved by ${row.reviewedByName}`;
  }
  if (row.reviewedByName) return `Approved by ${row.reviewedByName}`;
  if (row.requestedByName) return `Requested by ${row.requestedByName}`;
  return "-";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "-";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("en-IN");
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNum: number, colCount: number): void {
  for (let c = 1; c <= colCount; c++) {
    const cell = sheet.getCell(rowNum, c);
    cell.font = { bold: true, size: 10, color: { argb: "FF111827" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder as ExcelJS.Borders;
  }
  sheet.getRow(rowNum).height = 22;
}

function autoFitColumns(sheet: ExcelJS.Worksheet, colCount: number, maxRows = 50): void {
  for (let c = 1; c <= colCount; c++) {
    let maxLen = 10;
    const rowLimit = Math.min(sheet.rowCount, maxRows);
    for (let r = 1; r <= rowLimit; r++) {
      const v = sheet.getCell(r, c).value;
      const s = v == null ? "" : String(v);
      maxLen = Math.max(maxLen, Math.min(s.length, 50));
    }
    sheet.getColumn(c).width = Math.min(36, Math.max(10, maxLen * 0.9 + 2));
  }
}

async function copyWorksheet(
  sourceSheet: ExcelJS.Worksheet,
  targetWorkbook: ExcelJS.Workbook,
  newName: string
): Promise<void> {
  const targetSheet = targetWorkbook.addWorksheet(newName);
  targetSheet.model = JSON.parse(JSON.stringify(sourceSheet.model));
  targetSheet.name = newName;
}

function addSummarySheet(workbook: ExcelJS.Workbook, data: SchoolFeesBackupData): void {
  const sheet = workbook.addWorksheet("Summary");
  const totalCollected = roundRupee(
    data.transactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)
  );
  const totalDue = roundRupee(
    data.studentFees.reduce((sum, row) => sum + Number(row.remainingFee || 0), 0)
  );
  const totalDiscount = roundRupee(
    data.studentFees.reduce(
      (sum, row) => sum + Math.max(0, Number(row.totalFee || 0) - Number(row.finalFee || 0)),
      0
    )
  );

  const rows: (string | number)[][] = [
    ["School Fees Backup Report"],
    [data.school.name],
    [[data.school.address, data.school.location].filter(Boolean).join(", ") || "—"],
    [`Generated: ${new Date(data.generatedAt).toLocaleString("en-IN")}`],
    [""],
    ["Metric", "Value"],
    ["Total students with fees", data.studentFees.length],
    ["Total transactions", data.transactions.length],
    ["Total collected (₹)", totalCollected],
    ["Total fees due (₹)", totalDue],
    ["Total discounts applied (₹)", totalDiscount],
    ["Discount records", data.discounts.length],
    ["Approval history rows", data.discounts.filter((d) => d.source === "APPROVAL_REQUEST").length],
    ["Legacy direct discounts", data.discounts.filter((d) => d.source === "APPLIED_ON_RECORD").length],
    ["Refund records", data.refunds.length],
    [""],
    ["Sheets in this file"],
    ["Summary", "Overview counts"],
    ["Student Transactions", "Each payment row with student fee, discount, and fee-head context"],
    ["Student Ledger", "Per-student block: summary, fee heads, payments, discount history"],
    ["All Transactions", "Every fee payment with date, student, mode, UTR, fee heads"],
    ["Allocations", "One row per fee head allocation (audit detail)"],
    ["Student Fees", "Per-student fee, discount amount, who approved, all heads summary"],
    ["Discounts", "Admission, name, class, % , amount, final fee, date, remark, how given"],
    ["Refunds", "Refund records linked to payments"],
    ["Fee Due Report", "Full fee due breakdown by head"],
    ["Daily Totals", "Collection total per calendar date"],
  ];

  for (const row of rows) {
    sheet.addRow(row);
  }

  sheet.mergeCells(1, 1, 1, 2);
  sheet.mergeCells(2, 1, 2, 2);
  sheet.mergeCells(3, 1, 3, 2);
  sheet.mergeCells(4, 1, 4, 2);
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.getCell(2, 1).font = { bold: true, size: 12 };
  styleHeaderRow(sheet, 6, 2);
  autoFitColumns(sheet, 2, 20);
}

function addTransactionsSheet(workbook: ExcelJS.Workbook, data: SchoolFeesBackupData): void {
  const sheet = workbook.addWorksheet("All Transactions");
  const headers = [
    "Date & Time",
    "Payment ID",
    "Order / Ref ID",
    "UTR / Gateway Txn",
    "Student Name",
    "Admission No",
    "Class",
    "Amount (₹)",
    "Payment Mode",
    "Cash / Online",
    "Collected By",
    "Fee Heads",
    "Status",
  ];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);

  for (const tx of data.transactions) {
    const feeHeads =
      Array.isArray(tx.feeAllocations) && tx.feeAllocations.length > 0
        ? tx.feeAllocations.map((a) => `${a.name}: ₹${roundRupee(a.amount)}`).join("; ")
        : tx.feeTypeName || "-";
    const col = feeReportColumnFromGateway(tx.gateway);
    const cashOnline = col === "ONLINE PAYMENT" ? "Online" : "Offline";

    sheet.addRow([
      formatDateTime(tx.createdAt),
      tx.id,
      tx.transactionId || "-",
      tx.hyperpgTxnId || tx.transactionId || "-",
      (tx.student?.user?.name || "").trim() || "-",
      (tx.student?.admissionNumber || "").trim() || "-",
      formatStudentClassForReport(tx.student?.class ?? null),
      roundRupee(tx.amount ?? 0),
      tx.gateway || "-",
      cashOnline,
      tx.collectedByName || "-",
      feeHeads,
      "SUCCESS",
    ]);
  }

  for (let r = 2; r <= sheet.rowCount; r++) {
    const amountCell = sheet.getCell(r, 8);
    amountCell.numFmt = "#,##0.00";
    amountCell.alignment = { horizontal: "right" };
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoFitColumns(sheet, headers.length);
}

function addAllocationsSheet(workbook: ExcelJS.Workbook, data: SchoolFeesBackupData): void {
  const sheet = workbook.addWorksheet("Allocations");
  const headers = [
    "Date",
    "Payment ID",
    "Student Name",
    "Admission No",
    "Class",
    "Fee Head",
    "Allocated Amount (₹)",
    "Payment Mode",
    "Collected By",
  ];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);

  for (const tx of data.transactions) {
    const allocations =
      Array.isArray(tx.feeAllocations) && tx.feeAllocations.length > 0
        ? tx.feeAllocations
        : [{ name: tx.feeTypeName || "Default", amount: Number(tx.amount || 0) }];

    for (const al of allocations) {
      sheet.addRow([
        formatDateTime(tx.createdAt),
        tx.id,
        (tx.student?.user?.name || "").trim() || "-",
        (tx.student?.admissionNumber || "").trim() || "-",
        formatStudentClassForReport(tx.student?.class ?? null),
        al.name,
        roundRupee(al.amount),
        tx.gateway || "-",
        tx.collectedByName || "-",
      ]);
    }
  }

  for (let r = 2; r <= sheet.rowCount; r++) {
    sheet.getCell(r, 7).numFmt = "#,##0.00";
    sheet.getCell(r, 7).alignment = { horizontal: "right" };
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoFitColumns(sheet, headers.length);
}

function addStudentTransactionsSheet(workbook: ExcelJS.Workbook, data: SchoolFeesBackupData): void {
  const sheet = workbook.addWorksheet("Student Transactions");
  const dueByAdmission = indexDueRowByAdmission(data.feeDuePayload);
  const headers = [
    "Student Name",
    "Admission No",
    "Class",
    "Section",
    "Parent",
    "Mobile",
    "Total Fee (₹)",
    "Discount %",
    "Discount Amount (₹)",
    "Discount Head",
    "Discount Remarks",
    "Discount Requested By",
    "Discount Approved By",
    "Final Fee (₹)",
    "Total Paid (₹)",
    "Due (₹)",
    "All Fee Heads (Fee / Concession / Paid / Due)",
    "Payment Date & Time",
    "Payment Amount (₹)",
    "Payment Mode",
    "Cash / Online",
    "Collected By",
    "This Payment Fee Heads",
    "UTR / Ref",
    "Payment ID",
  ];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);

  const sortedStudents = [...data.studentFees].sort((a, b) =>
    (a.studentName || "").localeCompare(b.studentName || "", "en", { sensitivity: "base" })
  );
  const txMap = transactionsByAdmission(data);

  for (const student of sortedStudents) {
    const adm = student.admissionNumber || "";
    const dueRow = adm ? dueByAdmission.get(adm) : undefined;
    const headsSummary = dueRow ? feeHeadsSummaryText(dueRow, data.feeDuePayload) : "-";
    const txs = adm ? txMap.get(adm) ?? [] : [];

    const base = [
      student.studentName || "-",
      student.admissionNumber || "-",
      student.className || "-",
      student.section || "-",
      student.parent || "-",
      student.mobile || "-",
      roundRupee(student.totalFee),
      student.discountPercent,
      roundRupee(student.discountAmount),
      student.discountFeeHeadLabel || "-",
      student.discountRemarks || "-",
      student.discountRequestedBy || "-",
      student.discountApprovedBy || "-",
      roundRupee(student.finalFee),
      roundRupee(student.amountPaid),
      roundRupee(student.remainingFee),
      headsSummary,
    ];

    if (txs.length === 0) {
      sheet.addRow([...base, "-", 0, "-", "-", "-", "-", "-", "-"]);
      continue;
    }

    for (const tx of txs) {
      const col = feeReportColumnFromGateway(tx.gateway);
      const cashOnline = col === "ONLINE PAYMENT" ? "Online" : "Offline";
      sheet.addRow([
        ...base,
        formatDateTime(tx.createdAt),
        roundRupee(tx.amount ?? 0),
        tx.gateway || "-",
        cashOnline,
        tx.collectedByName || "-",
        formatFeeHeadAllocations(tx),
        tx.hyperpgTxnId || tx.transactionId || "-",
        tx.id,
      ]);
    }
  }

  for (let r = 2; r <= sheet.rowCount; r++) {
    for (const c of [7, 9, 14, 15, 16, 19]) {
      const cell = sheet.getCell(r, c);
      if (typeof cell.value === "number") {
        cell.numFmt = "#,##0.00";
        cell.alignment = { horizontal: "right" };
      }
    }
    sheet.getCell(r, 17).alignment = { wrapText: true, vertical: "top" };
    sheet.getCell(r, 23).alignment = { wrapText: true, vertical: "top" };
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoFitColumns(sheet, headers.length, 200);
}

function addStudentLedgerSheet(workbook: ExcelJS.Workbook, data: SchoolFeesBackupData): void {
  const sheet = workbook.addWorksheet("Student Ledger");
  const dueByAdmission = indexDueRowByAdmission(data.feeDuePayload);
  const txMap = transactionsByAdmission(data);
  const discMap = discountsByAdmission(data);

  const sortedStudents = [...data.studentFees].sort((a, b) =>
    (a.studentName || "").localeCompare(b.studentName || "", "en", { sensitivity: "base" })
  );

  for (const student of sortedStudents) {
    const adm = student.admissionNumber || "";
    const dueRow = adm ? dueByAdmission.get(adm) : undefined;
    const txs = adm ? txMap.get(adm) ?? [] : [];
    const discRows = adm ? discMap.get(adm) ?? [] : [];

    sheet.addRow([`STUDENT: ${student.studentName || "-"}`, `Adm: ${student.admissionNumber || "-"}`, studentClassLabel(student)]);
    const titleRow = sheet.rowCount;
    sheet.mergeCells(titleRow, 1, titleRow, 6);
    sheet.getCell(titleRow, 1).font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
    sheet.getCell(titleRow, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E2F3" },
    };

    sheet.addRow([
      "Total Fee",
      "Discount %",
      "Discount ₹",
      "Final Fee",
      "Paid",
      "Due",
      "Discount Head",
      "Remarks",
      "Requested By",
      "Approved By",
    ]);
    styleHeaderRow(sheet, sheet.rowCount, 10);
    sheet.addRow([
      roundRupee(student.totalFee),
      student.discountPercent,
      roundRupee(student.discountAmount),
      roundRupee(student.finalFee),
      roundRupee(student.amountPaid),
      roundRupee(student.remainingFee),
      student.discountFeeHeadLabel || "-",
      student.discountRemarks || "-",
      student.discountRequestedBy || "-",
      student.discountApprovedBy || "-",
    ]);

    if (dueRow && data.feeDuePayload.groups.length > 0) {
      sheet.addRow(["Fee Head", "Fee (₹)", "Concession (₹)", "Paid (₹)", "Due (₹)"]);
      styleHeaderRow(sheet, sheet.rowCount, 5);
      for (const g of data.feeDuePayload.groups) {
        const c = dueRow.cellsByGroupId[g.id];
        if (!c || (c.fee === 0 && c.concession === 0 && c.paid === 0 && c.due === 0)) continue;
        sheet.addRow([g.label, roundRupee(c.fee), roundRupee(c.concession), roundRupee(c.paid), roundRupee(c.due)]);
      }
    }

    sheet.addRow(["Payment Date", "Amount (₹)", "Mode", "Collected By", "Fee Heads", "UTR / Ref"]);
    styleHeaderRow(sheet, sheet.rowCount, 6);
    if (txs.length === 0) {
      sheet.addRow(["No payments", "-", "-", "-", "-", "-"]);
    } else {
      for (const tx of txs) {
        sheet.addRow([
          formatDateTime(tx.createdAt),
          roundRupee(tx.amount ?? 0),
          tx.gateway || "-",
          tx.collectedByName || "-",
          formatFeeHeadAllocations(tx),
          tx.hyperpgTxnId || tx.transactionId || "-",
        ]);
      }
    }

    if (discRows.length > 0) {
      sheet.addRow([
        "Date",
        "Admission ID",
        "Name",
        "Class",
        "Discount %",
        "Discount (₹)",
        "Final Fee (₹)",
        "Remark",
        "How Given",
      ]);
      styleHeaderRow(sheet, sheet.rowCount, 9);
      for (const d of discRows) {
        sheet.addRow([
          discountDisplayDate(d),
          d.admissionNumber,
          d.studentName || "-",
          discountClassLabel(d),
          d.discountPercent,
          roundRupee(d.discountAmount),
          roundRupee(d.finalFee),
          discountRemarkText(d),
          discountHowGivenText(d),
        ]);
      }
    }

    sheet.addRow([]);
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoFitColumns(sheet, 10, 300);
}

function addStudentFeesSheet(workbook: ExcelJS.Workbook, data: SchoolFeesBackupData): void {
  const sheet = workbook.addWorksheet("Student Fees");
  const dueByAdmission = indexDueRowByAdmission(data.feeDuePayload);
  const txMap = transactionsByAdmission(data);
  const headers = [
    "Student Name",
    "Admission No",
    "Class",
    "Section",
    "Parent",
    "Mobile",
    "Category",
    "Total Fee (₹)",
    "Discount %",
    "Discount Amount (₹)",
    "Discount Head",
    "Discount Remarks",
    "Discount Requested By",
    "Discount Approved By",
    "Final Fee (₹)",
    "Paid (₹)",
    "Due (₹)",
    "Payment Count",
    "Last Payment Date",
    "All Fee Heads Summary",
  ];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);

  for (const row of data.studentFees) {
    const adm = row.admissionNumber || "";
    const dueRow = adm ? dueByAdmission.get(adm) : undefined;
    const txs = adm ? txMap.get(adm) ?? [] : [];
    const lastTx = txs.length > 0 ? txs[txs.length - 1] : null;
    const classLabel = row.className || "-";
    sheet.addRow([
      row.studentName || "-",
      row.admissionNumber || "-",
      classLabel,
      row.section || "-",
      row.parent || "-",
      row.mobile || "-",
      row.category || "-",
      roundRupee(row.totalFee),
      row.discountPercent,
      roundRupee(row.discountAmount),
      row.discountFeeHeadLabel || "-",
      row.discountRemarks || "-",
      row.discountRequestedBy || "-",
      row.discountApprovedBy || "-",
      roundRupee(row.finalFee),
      roundRupee(row.amountPaid),
      roundRupee(row.remainingFee),
      txs.length,
      lastTx ? formatDateTime(lastTx.createdAt) : "-",
      dueRow ? feeHeadsSummaryText(dueRow, data.feeDuePayload) : "-",
    ]);
  }

  for (let r = 2; r <= sheet.rowCount; r++) {
    for (const c of [8, 10, 15, 16, 17]) {
      sheet.getCell(r, c).numFmt = "#,##0.00";
      sheet.getCell(r, c).alignment = { horizontal: "right" };
    }
    sheet.getCell(r, 20).alignment = { wrapText: true, vertical: "top" };
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoFitColumns(sheet, headers.length, 200);
}

function addDiscountsSheet(workbook: ExcelJS.Workbook, data: SchoolFeesBackupData): void {
  const sheet = workbook.addWorksheet("Discounts");
  const headers = [
    "Admission ID",
    "Name",
    "Class",
    "Discount %",
    "Discount Amount (₹)",
    "Final Fee (₹)",
    "Date",
    "Remark",
    "How Given",
  ];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);

  for (const row of data.discounts) {
    sheet.addRow([
      row.admissionNumber,
      row.studentName || "-",
      discountClassLabel(row),
      row.discountPercent,
      roundRupee(row.discountAmount),
      roundRupee(row.finalFee),
      discountDisplayDate(row),
      discountRemarkText(row),
      discountHowGivenText(row),
    ]);
  }

  for (let r = 2; r <= sheet.rowCount; r++) {
    for (const c of [5, 6]) {
      const cell = sheet.getCell(r, c);
      if (typeof cell.value === "number") {
        cell.numFmt = "#,##0.00";
        cell.alignment = { horizontal: "right" };
      }
    }
    sheet.getCell(r, 8).alignment = { wrapText: true, vertical: "top" };
    sheet.getCell(r, 9).alignment = { wrapText: true, vertical: "top" };
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoFitColumns(sheet, headers.length, 300);
}

function addRefundsSheet(workbook: ExcelJS.Workbook, data: SchoolFeesBackupData): void {
  const sheet = workbook.addWorksheet("Refunds");
  const headers = [
    "Refund Date",
    "Refund ID",
    "Payment ID",
    "Student Name",
    "Admission No",
    "Original Payment (₹)",
    "Payment Date",
    "Refund Amount (₹)",
    "Reason",
    "Status",
  ];
  sheet.addRow(headers);
  styleHeaderRow(sheet, 1, headers.length);

  for (const row of data.refunds) {
    sheet.addRow([
      formatDate(row.createdAt),
      row.id,
      row.paymentId,
      row.studentName || "-",
      row.admissionNumber || "-",
      roundRupee(row.paymentAmount),
      formatDate(row.paymentDate),
      roundRupee(row.amount),
      row.reason || "-",
      row.status,
    ]);
  }

  for (let r = 2; r <= sheet.rowCount; r++) {
    for (const c of [6, 8]) {
      sheet.getCell(r, c).numFmt = "#,##0.00";
      sheet.getCell(r, c).alignment = { horizontal: "right" };
    }
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autoFitColumns(sheet, headers.length);
}

/** Multi-sheet Excel backup: transactions, allocations, dues, discounts, refunds. */
export async function buildSchoolFeesBackupWorkbook(
  data: SchoolFeesBackupData
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ERP Superadmin Backup";
  workbook.created = new Date(data.generatedAt);

  addSummarySheet(workbook, data);
  addStudentTransactionsSheet(workbook, data);
  addStudentLedgerSheet(workbook, data);
  addTransactionsSheet(workbook, data);
  addAllocationsSheet(workbook, data);
  addStudentFeesSheet(workbook, data);
  addDiscountsSheet(workbook, data);
  addRefundsSheet(workbook, data);

  const dueWorkbook = await buildFeeDueReportWorkbook(data.feeDuePayload);
  const dueSheet = dueWorkbook.worksheets[0];
  if (dueSheet) {
    await copyWorksheet(dueSheet, workbook, "Fee Due Report");
  }

  const dailySheet = workbook.addWorksheet("Daily Totals");
  dailySheet.addRow(["Date", "Transaction Lines", "Total Collected (₹)"]);
  styleHeaderRow(dailySheet, 1, 3);

  const sortedDates = Array.from(
    data.transactions.reduce((map, tx) => {
      const d = new Date(tx.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const list = map.get(key) ?? [];
      list.push(tx);
      map.set(key, list);
      return map;
    }, new Map<string, typeof data.transactions>())
  ).sort(([a], [b]) => a.localeCompare(b));

  for (const [dateKey, txs] of sortedDates) {
    const model = buildDayReportSummaryModel(txs);
    dailySheet.addRow([dateKey, model.detailRows.length, model.totalCollection]);
  }

  for (let r = 2; r <= dailySheet.rowCount; r++) {
    dailySheet.getCell(r, 3).numFmt = "#,##0.00";
    dailySheet.getCell(r, 3).alignment = { horizontal: "right" };
  }
  dailySheet.views = [{ state: "frozen", ySplit: 1 }];
  autoFitColumns(dailySheet, 3);

  return workbook;
}

export function schoolFeesBackupFilename(schoolName: string): string {
  const safe = schoolName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `fees-backup-${safe || "school"}-${date}.xlsx`;
}
