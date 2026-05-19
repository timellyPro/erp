import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { feeReportColumnFromGateway, type FeeReportColumn } from "@/lib/feePaymentGateway";

export type DayReportSchool = {
  name?: string | null;
  address?: string | null;
  location?: string | null;
  affiliationLine?: string | null;
};

export type DayReportTx = {
  id: string;
  amount?: number;
  gateway?: string;
  createdAt: string;
  feeTypeName?: string;
  transactionId?: string | null;
  hyperpgTxnId?: string | null;
  feeAllocations?: Array<{ name: string; amount: number }>;
  student?: {
    admissionNumber?: string | null;
    user?: { name?: string | null } | null;
    class?: { name?: string | null; section?: string | null } | null;
  } | null;
};

const TABLE_COLS = 9;

type ModeTotals = { cash: number; online: number; otherMode: number };

export function formatDdMmYyyy(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** `YYYY-MM-DD` from a date input — DD.MM.YYYY using local calendar (matches day-wise filter). */
export function formatDdMmYyyyFromYmdInput(ymd: string): string {
  const parts = ymd.split("-").map((v) => Number(v));
  const y = parts[0];
  const m = parts[1];
  const day = parts[2];
  if (!y || !m || !day) return "-";
  const d = new Date(y, m - 1, day);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function classCompact(c?: { name?: string | null; section?: string | null } | null): string {
  if (!c) return "-";
  const n = (c.name || "").trim();
  const s = (c.section || "").trim();
  if (n && s) return `${n}${s}`;
  return n || s || "-";
}

/** Fee type column: same label as stored on the fee head / allocation (trimmed). */
function feeTypeDisplay(name: string): string {
  const t = normalizeAccount(name);
  return t === "Default" ? "—" : t;
}

function cashOnlineCell(gateway?: string): string {
  const col = feeReportColumnFromGateway(gateway);
  if (col === "ONLINE PAYMENT") return "ONLINE";
  if (col === "Cash") return "Cash";
  if (col === "Cheque") return "Cheque";
  if (col === "DD") return "DD";
  return "Others";
}

function utrForRow(gateway: string | undefined, transactionId?: string | null, hyperpgTxnId?: string | null): string {
  const col = feeReportColumnFromGateway(gateway);
  const tid = typeof transactionId === "string" ? transactionId.trim() : "";
  const hid = typeof hyperpgTxnId === "string" ? hyperpgTxnId.trim() : "";
  if (col === "ONLINE PAYMENT") return hid || tid || "-";
  return tid || "-";
}

function normalizeAccount(feeTypeName?: string): string {
  const label = (feeTypeName || "").trim().replace(/\s+/g, " ");
  return label || "Default";
}

function allocationsForTx(tx: DayReportTx): Array<{ name: string; amount: number }> {
  return Array.isArray(tx.feeAllocations) && tx.feeAllocations.length > 0
    ? tx.feeAllocations
    : [{ name: normalizeAccount(tx.feeTypeName), amount: Number(tx.amount || 0) }];
}

/** Sorted fee-head labels from the summary map (Default last). */
function sortedFeeHeadLabels(summary: Map<string, ModeTotals>): string[] {
  const keys = Array.from(summary.keys());
  const rest = keys.filter((x) => x !== "Default").sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return keys.includes("Default") ? [...rest, "Default"] : rest;
}

/** Summary sits under the table, label in “Fee Type” col and amount in “Amount Paid” col (template style). */
const SUMMARY_LABEL_COL = 6;
const SUMMARY_AMOUNT_COL = 7;

function pushSummarySection(
  rows: (string | number)[][],
  padRow: (cells: (string | number)[]) => (string | number)[],
  headLabels: string[],
  title: string,
  total: number,
  getAmount: (head: string) => number
) {
  const headRow = Array(TABLE_COLS).fill("");
  headRow[SUMMARY_LABEL_COL] = title;
  headRow[SUMMARY_AMOUNT_COL] = Math.round(total * 100) / 100;
  rows.push(padRow(headRow));

  for (const head of headLabels) {
    const r = Array(TABLE_COLS).fill("");
    r[SUMMARY_LABEL_COL] = head;
    r[SUMMARY_AMOUNT_COL] = Math.round(getAmount(head) * 100) / 100;
    rows.push(padRow(r));
  }
}

function addToSummary(
  matrix: Map<string, ModeTotals>,
  feeLabel: string,
  amount: number,
  gateway: string | undefined
): void {
  const key = normalizeAccount(feeLabel);
  if (!matrix.has(key)) {
    matrix.set(key, { cash: 0, online: 0, otherMode: 0 });
  }
  const row = matrix.get(key)!;
  const col: FeeReportColumn = feeReportColumnFromGateway(gateway);
  const n = Number(amount) || 0;
  if (col === "Cash") row.cash += n;
  else if (col === "ONLINE PAYMENT") row.online += n;
  else row.otherMode += n;
}

export type DayReportDetailRow = {
  receiptNo: number;
  admissionNo: string;
  date: string;
  studentName: string;
  className: string;
  feeType: string;
  cashOnline: string;
  amount: number;
  utr: string;
};

export type DayReportSummaryModel = {
  detailRows: DayReportDetailRow[];
  headLabels: string[];
  summary: Map<string, ModeTotals>;
  cashTotal: number;
  onlineTotal: number;
  otherTotal: number;
  totalCollection: number;
};

/** Shared detail rows + Cash/Online summary (Excel + PDF). */
export function buildDayReportSummaryModel(transactions: DayReportTx[]): DayReportSummaryModel {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const receiptByPaymentId = new Map<string, number>();
  let receiptCounter = 0;
  const getReceiptNo = (paymentId: string) => {
    let r = receiptByPaymentId.get(paymentId);
    if (r === undefined) {
      receiptCounter += 1;
      r = receiptCounter;
      receiptByPaymentId.set(paymentId, r);
    }
    return r;
  };

  const summary = new Map<string, ModeTotals>();
  const detailRows: DayReportDetailRow[] = [];

  for (const tx of sorted) {
    const rec = getReceiptNo(tx.id);
    const gateway = tx.gateway;
    const allocations = allocationsForTx(tx);

    for (const al of allocations) {
      const feeName = normalizeAccount(al.name);
      const amt = Number(al.amount || 0);
      addToSummary(summary, feeName, amt, gateway);
      detailRows.push({
        receiptNo: rec,
        admissionNo: (tx.student?.admissionNumber || "").trim() || "-",
        date: formatDdMmYyyy(tx.createdAt),
        studentName: (tx.student?.user?.name || "").trim() || "-",
        className: classCompact(tx.student?.class || null),
        feeType: feeTypeDisplay(feeName),
        cashOnline: cashOnlineCell(gateway),
        amount: Math.round(amt * 100) / 100,
        utr: utrForRow(gateway, tx.transactionId, tx.hyperpgTxnId),
      });
    }
  }

  const headLabels = sortedFeeHeadLabels(summary);
  let cashTotal = 0;
  let onlineTotal = 0;
  let otherTotal = 0;
  for (const h of headLabels) {
    const t = summary.get(h);
    if (!t) continue;
    cashTotal += t.cash;
    onlineTotal += t.online;
    otherTotal += t.otherMode;
  }

  const totalCollection = detailRows.reduce((s, r) => s + r.amount, 0);

  return {
    detailRows,
    headLabels,
    summary,
    cashTotal: Math.round(cashTotal * 100) / 100,
    onlineTotal: Math.round(onlineTotal * 100) / 100,
    otherTotal: Math.round(otherTotal * 100) / 100,
    totalCollection: Math.round(totalCollection * 100) / 100,
  };
}

async function loadLogoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** PDF export with the same Cash/Online summary block as the Excel day report. */
export async function drawFeeDayReportPdf(args: {
  filename: string;
  school: DayReportSchool | null | undefined;
  reportTitle: string;
  headerDateLabel: string;
  transactions: DayReportTx[];
  logoUrl?: string | null;
}): Promise<void> {
  const model = buildDayReportSummaryModel(args.transactions);
  if (model.detailRows.length === 0) return;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageWidth - margin * 2;
  const schoolName = (args.school?.name || "School").trim();
  const addr = [args.school?.address, args.school?.location, args.school?.affiliationLine]
    .filter((x) => typeof x === "string" && x.trim())
    .join(", ");

  const cols = [
    { key: "receiptNo", label: "Receipt no", w: 14 },
    { key: "admissionNo", label: "Admission no", w: 22 },
    { key: "date", label: "Date", w: 18 },
    { key: "studentName", label: "Name of the Student", w: 38 },
    { key: "className", label: "Class", w: 14 },
    { key: "feeType", label: "Fee Type", w: 36 },
    { key: "cashOnline", label: "Cash/Online", w: 18 },
    { key: "amount", label: "Amount Paid", w: 18 },
    { key: "utr", label: "UTR", w: 28 },
  ] as const;

  const colWidths = cols.map((c) => c.w);
  const widthSum = colWidths.reduce((a, b) => a + b, 0);
  if (widthSum < contentW) {
    const extra = (contentW - widthSum) / 2;
    colWidths[3] += extra;
    colWidths[5] += extra;
  }

  const logoData = await loadLogoDataUrl(args.logoUrl);

  const drawHeader = () => {
    doc.setFillColor(22, 40, 72);
    doc.rect(0, 0, pageWidth, 32, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(schoolName, pageWidth / 2, 10, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const addrLines = doc.splitTextToSize(addr || "", contentW - 20) as string[];
    doc.text(addrLines.slice(0, 2), pageWidth / 2, 16, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(args.reportTitle, margin, 24);
    doc.setFont("helvetica", "normal");
    doc.text(args.headerDateLabel, pageWidth - margin, 24, { align: "right" });
    if (logoData) {
      try {
        doc.addImage(logoData, "PNG", margin, 4, 14, 14);
      } catch {
        /* ignore */
      }
    }
    return 40;
  };

  const TABLE_HEADER_H = 9;
  const ROW_H = 6;

  const drawTableHeader = (y: number) => {
    doc.setFillColor(230, 236, 248);
    doc.rect(margin, y, contentW, TABLE_HEADER_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    const labelY = y + TABLE_HEADER_H - 2.8;
    let x = margin + 1;
    cols.forEach((c, i) => {
      const w = colWidths[i];
      const align = c.key === "amount" ? ("right" as const) : ("left" as const);
      const lines = doc.splitTextToSize(c.label, Math.max(8, w - 2)) as string[];
      const line = lines[0] || c.label;
      if (align === "right") doc.text(line, x + w - 1, labelY, { align: "right" });
      else doc.text(line, x + 1, labelY);
      x += w;
    });
    return y + TABLE_HEADER_H + 1;
  };

  const drawSummaryBlock = (startY: number) => {
    const labelX = margin + contentW * 0.52;
    const amountX = pageWidth - margin;
    let y = startY + 4;
    const lineH = 5;
    const fmt = (n: number) => n.toLocaleString("en-IN");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);

    const drawSection = (title: string, total: number, getAmt: (head: string) => number) => {
      doc.text(title, labelX, y);
      doc.text(fmt(total), amountX, y, { align: "right" });
      y += lineH;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      for (const head of model.headLabels) {
        const amt = getAmt(head);
        doc.text(head, labelX + 3, y);
        doc.text(fmt(amt), amountX, y, { align: "right" });
        y += lineH;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      y += 1;
    };

    drawSection("Cash", model.cashTotal, (h) => model.summary.get(h)?.cash ?? 0);
    drawSection("Online", model.onlineTotal, (h) => model.summary.get(h)?.online ?? 0);
    if (model.otherTotal > 0.00001) {
      drawSection("Cheque / DD / Others", model.otherTotal, (h) => model.summary.get(h)?.otherMode ?? 0);
    }

    doc.setFontSize(10);
    doc.text("Total Collection", labelX, y);
    doc.text(fmt(model.totalCollection), amountX, y, { align: "right" });
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Signature of Director", margin, y);
    doc.text("Signature of Cashier", pageWidth - margin, y, { align: "right" });
    return y;
  };

  let y = drawHeader();
  y = drawTableHeader(y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);

  const summaryBlockH = 28 + model.headLabels.length * 10;

  for (let i = 0; i < model.detailRows.length; i++) {
    if (y + ROW_H > pageHeight - summaryBlockH - 8) {
      doc.addPage();
      y = drawTableHeader(10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
    }
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentW, ROW_H, "F");
    }
    const row = model.detailRows[i];
    let x = margin + 1;
    const textY = y + 4.2;
    const values: (string | number)[] = [
      row.receiptNo,
      row.admissionNo,
      row.date,
      row.studentName,
      row.className,
      row.feeType,
      row.cashOnline,
      row.amount,
      row.utr,
    ];
    values.forEach((val, idx) => {
      const w = colWidths[idx];
      const text = typeof val === "number" ? val.toLocaleString("en-IN") : String(val);
      if (idx === values.length - 2) doc.text(text, x + w - 1, textY, { align: "right" });
      else doc.text(doc.splitTextToSize(text, w - 2)[0] || "-", x + 1, textY);
      x += w;
    });
    y += ROW_H;
  }

  if (y + summaryBlockH > pageHeight - 10) {
    doc.addPage();
    y = 14;
  } else {
    y += 4;
  }
  drawSummaryBlock(y);

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated on ${new Date().toLocaleString("en-IN")}`, pageWidth - margin, pageHeight - 5, {
    align: "right",
  });
  doc.save(args.filename);
}

/**
 * One-sheet day report: school header, detail grid (receipt / admission / date / …), summary, signatures.
 */
export function appendDayReportSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  school: DayReportSchool | null | undefined,
  reportTitle: string,
  /** Shown top-right (e.g. 15.04.2026 or 2026-04 / 2025-2026) */
  headerDateLabel: string,
  transactions: DayReportTx[]
): void {
  const schoolName = (school?.name || "School").trim();
  const affiliation =
    (school?.affiliationLine && String(school.affiliationLine).trim()) ||
    "";
  const addr = [school?.address, school?.location].filter((x) => typeof x === "string" && x.trim()).join(", ");

  const model = buildDayReportSummaryModel(transactions);

  const rows: (string | number)[][] = [];
  const merges: XLSX.Range[] = [];

  const padRow = (cells: (string | number)[]): (string | number)[] => {
    const r = [...cells];
    while (r.length < TABLE_COLS) r.push("");
    return r.slice(0, TABLE_COLS);
  };

  const pushMerge = (r1: number, c1: number, r2: number, c2: number) => {
    merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  };

  const push = (cells: (string | number)[]) => {
    rows.push(padRow(cells));
    return rows.length - 1;
  };

  // --- Header ---
  const r0 = push([schoolName]);
  pushMerge(r0, 0, r0, TABLE_COLS - 1);

  const r1 = push([affiliation || " "]);
  pushMerge(r1, 0, r1, TABLE_COLS - 1);

  const r2 = push([addr || " "]);
  pushMerge(r2, 0, r2, TABLE_COLS - 1);

  const r3 = push([reportTitle, "", "", "", "", "", "", "", headerDateLabel]);
  pushMerge(r3, 0, r3, TABLE_COLS - 2);

  push(Array(TABLE_COLS).fill(""));

  push([
    "Receipt no",
    "Admission no",
    "Date",
    "Name of the Student",
    "Class",
    "Fee Type",
    "Cash/Online",
    "Amount Paid",
    "UTR",
  ]);

  for (const row of model.detailRows) {
    push([
      row.receiptNo,
      row.admissionNo,
      row.date,
      row.studentName,
      row.className,
      row.feeType,
      row.cashOnline,
      row.amount,
      row.utr,
    ]);
  }

  const { headLabels, summary, cashTotal, onlineTotal, otherTotal, totalCollection } = model;

  push(Array(TABLE_COLS).fill(""));

  pushSummarySection(rows, padRow, headLabels, "Cash", cashTotal, (h) => summary.get(h)?.cash ?? 0);
  pushSummarySection(rows, padRow, headLabels, "Online", onlineTotal, (h) => summary.get(h)?.online ?? 0);

  if (otherTotal > 0.00001) {
    pushSummarySection(
      rows,
      padRow,
      headLabels,
      "Cheque / DD / Others",
      otherTotal,
      (h) => summary.get(h)?.otherMode ?? 0
    );
  }

  const totRow = Array(TABLE_COLS).fill("");
  totRow[SUMMARY_LABEL_COL] = "Total Collection";
  totRow[SUMMARY_AMOUNT_COL] = totalCollection;
  push(padRow(totRow));

  push(Array(TABLE_COLS).fill(""));
  push(["Signature of Director", "", "", "", "", "", "", "", "Signature of Cashier"]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 28 },
    { wch: 8 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 36 },
  ];

  XLSX.utils.book_append_sheet(workbook, ws, sheetName);
}
