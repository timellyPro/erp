import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { canonicalExtraFeeBaseName } from "@/lib/extraFeeInstallments";
import {
  isHostelCategoryExtraFeeName,
  isMessCategoryExtraFeeName,
} from "@/lib/extraFeeResidencyScope";
import { feeReportColumnFromGateway, type FeeReportColumn } from "@/lib/feePaymentGateway";
import { roundRupee } from "@/lib/formatRupee";
import { isTuitionNamedExtraFee } from "@/lib/studentRte";

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

/** Fixed Cash/Online summary rows (template order). */
export const SUMMARY_BUCKET_LABELS = [
  "Tuition Fee",
  "Mess Fee",
  "Hostel Fee",
  "Transport Fee",
  "other heads",
] as const;

export type SummaryBucketLabel = (typeof SUMMARY_BUCKET_LABELS)[number];

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

/** Class label for reports (e.g. CLASS 7 + A → 7-A). Avoids PDF column clipping "CLASS 7" to "CLASS". */
export function formatStudentClassForReport(
  c?: { name?: string | null; section?: string | null } | null
): string {
  if (!c) return "-";
  const n = (c.name || "").trim();
  const s = (c.section || "").trim();
  const classNum = n.match(/^class\s*(\d{1,2})$/i);
  if (classNum) return s ? `${classNum[1]}-${s}` : classNum[1];
  const gradeNum = n.match(/^grade\s*(\d{1,2})$/i);
  if (gradeNum) return s ? `${gradeNum[1]}-${s}` : gradeNum[1];
  if (/^\d{1,2}$/.test(n)) return s ? `${n}-${s}` : n;
  if (n && s) return `${n}-${s}`;
  return n || s || "-";
}

/** Fee type column — transport heads show as "Transport Fee" without kms/route suffix. */
function feeTypeDisplay(name: string): string {
  const t = normalizeAccount(name);
  if (t === "Default") return "—";
  if (t.toLowerCase().includes("transport")) return "Transport Fee";
  return t;
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

/** Fee head label for reports — strips 1st/2nd installment suffixes so only the head name shows. */
function normalizeAccount(feeTypeName?: string): string {
  const raw = (feeTypeName || "").trim().replace(/\s+/g, " ");
  if (!raw) return "Default";
  const head = canonicalExtraFeeBaseName(raw);
  return head || "Default";
}

function allocationsForTx(tx: DayReportTx): Array<{ name: string; amount: number }> {
  return Array.isArray(tx.feeAllocations) && tx.feeAllocations.length > 0
    ? tx.feeAllocations
    : [{ name: normalizeAccount(tx.feeTypeName), amount: Number(tx.amount || 0) }];
}

/** Map any fee-head label into the fixed summary bucket. */
export function feeHeadSummaryBucket(feeTypeName?: string): SummaryBucketLabel {
  const raw = (feeTypeName || "").trim();
  if (isTuitionNamedExtraFee(raw)) return "Tuition Fee";
  if (isMessCategoryExtraFeeName(raw)) return "Mess Fee";
  if (isHostelCategoryExtraFeeName(raw)) return "Hostel Fee";
  const lower = raw.toLowerCase();
  if (lower.includes("transport")) return "Transport Fee";
  return "other heads";
}

function otherHeadsBucketTotal(summary: Map<SummaryBucketLabel, ModeTotals>): number {
  const t = summary.get("other heads");
  if (!t) return 0;
  return t.cash + t.online + t.otherMode;
}

/** Buckets to render in Cash/Online summary — omits "other heads" when unused. */
function resolveActiveSummaryBuckets(
  summary: Map<SummaryBucketLabel, ModeTotals>
): SummaryBucketLabel[] {
  if (otherHeadsBucketTotal(summary) > 0.00001) return [...SUMMARY_BUCKET_LABELS];
  return SUMMARY_BUCKET_LABELS.filter((b) => b !== "other heads");
}

/** Summary sits under the table, label in “Fee Type” col and amount in “Amount Paid” col (template style). */
const SUMMARY_LABEL_COL = 6;
const SUMMARY_AMOUNT_COL = 7;

function pushSummarySection(
  rows: (string | number)[][],
  padRow: (cells: (string | number)[]) => (string | number)[],
  buckets: readonly SummaryBucketLabel[],
  title: string,
  total: number,
  getAmount: (bucket: SummaryBucketLabel) => number
) {
  const headRow = Array(TABLE_COLS).fill("");
  headRow[SUMMARY_LABEL_COL] = title;
  headRow[SUMMARY_AMOUNT_COL] = roundRupee(total);
  rows.push(padRow(headRow));

  for (const bucket of buckets) {
    const r = Array(TABLE_COLS).fill("");
    r[SUMMARY_LABEL_COL] = bucket;
    r[SUMMARY_AMOUNT_COL] = roundRupee(getAmount(bucket));
    rows.push(padRow(r));
  }
}

function addToSummary(
  matrix: Map<SummaryBucketLabel, ModeTotals>,
  feeLabel: string,
  amount: number,
  gateway: string | undefined
): void {
  const key = feeHeadSummaryBucket(feeLabel);
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
  summaryBuckets: readonly SummaryBucketLabel[];
  summary: Map<SummaryBucketLabel, ModeTotals>;
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

  const summary = new Map<SummaryBucketLabel, ModeTotals>();
  const detailRows: DayReportDetailRow[] = [];

  for (const tx of sorted) {
    const rec = getReceiptNo(tx.id);
    const gateway = tx.gateway;
    const allocations = allocationsForTx(tx);

    for (const al of allocations) {
      const feeName = normalizeAccount(al.name);
      const amt = Number(al.amount || 0);
      addToSummary(summary, al.name || feeName, amt, gateway);
      detailRows.push({
        receiptNo: rec,
        admissionNo: (tx.student?.admissionNumber || "").trim() || "-",
        date: formatDdMmYyyy(tx.createdAt),
        studentName: (tx.student?.user?.name || "").trim() || "-",
        className: formatStudentClassForReport(tx.student?.class || null),
        feeType: feeTypeDisplay(feeName),
        cashOnline: cashOnlineCell(gateway),
        amount: roundRupee(amt),
        utr: utrForRow(gateway, tx.transactionId, tx.hyperpgTxnId),
      });
    }
  }

  let cashTotal = 0;
  let onlineTotal = 0;
  let otherTotal = 0;
  for (const bucket of SUMMARY_BUCKET_LABELS) {
    const t = summary.get(bucket);
    if (!t) continue;
    cashTotal += t.cash;
    onlineTotal += t.online;
    otherTotal += t.otherMode;
  }

  const totalCollection = detailRows.reduce((s, r) => s + r.amount, 0);

  return {
    detailRows,
    summaryBuckets: resolveActiveSummaryBuckets(summary),
    summary,
    cashTotal: roundRupee(cashTotal),
    onlineTotal: roundRupee(onlineTotal),
    otherTotal: roundRupee(otherTotal),
    totalCollection: roundRupee(totalCollection),
  };
}

function imageFormatFromDataUrl(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (dataUrl.startsWith("data:image/jpeg") || dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return "PNG";
}

export function resolveSchoolLogoFetchUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  let parsed = url.trim();
  if (parsed.includes("/storage/v1/object/")) {
    parsed = `/api/media?url=${encodeURIComponent(parsed)}`;
  }
  if (parsed.startsWith("/") && typeof window !== "undefined") {
    parsed = `${window.location.origin}${parsed}`;
  }
  return parsed;
}

/** Keep IDs (admission no, etc.) on one line — shrink font before truncating. */
function drawPdfSingleLineCell(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  align: "left" | "right" = "left"
): void {
  const pad = 2;
  const maxW = Math.max(4, width - pad);
  const value = String(text ?? "").trim() || "-";
  const baseSize = doc.getFontSize();
  let size = baseSize;
  const minSize = 5.5;

  while (size > minSize && doc.getTextWidth(value) > maxW) {
    size -= 0.25;
    doc.setFontSize(size);
  }

  let display = value;
  if (doc.getTextWidth(display) > maxW) {
    const ellipsis = "...";
    let low = 0;
    let high = display.length;
    let best = ellipsis;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `${display.slice(0, mid)}${ellipsis}`;
      if (doc.getTextWidth(candidate) <= maxW) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    display = best;
  }

  const textX = align === "right" ? x + width - 1 : x + 1;
  doc.text(display, textX, y, align === "right" ? { align: "right" } : undefined);
  doc.setFontSize(baseSize);
}

async function loadLogoDataUrl(url: string | null | undefined): Promise<string | null> {
  const fetchUrl = resolveSchoolLogoFetchUrl(url);
  if (!fetchUrl) return null;
  try {
    const res = await fetch(fetchUrl, { credentials: "include", cache: "no-store" });
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

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  const paintWhitePage = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    doc.setTextColor(0, 0, 0);
  };
  paintWhitePage();
  const contentW = pageWidth - margin * 2;
  const schoolName = (args.school?.name || "School").trim();
  const addr = [args.school?.address, args.school?.location, args.school?.affiliationLine]
    .filter((x) => typeof x === "string" && x.trim())
    .join(", ");

  const cols = [
    { key: "receiptNo", label: "Receipt no", w: 11 },
    { key: "admissionNo", label: "Admission no", w: 30 },
    { key: "date", label: "Date", w: 14 },
    { key: "studentName", label: "Name of the Student", w: 30 },
    { key: "className", label: "Class", w: 14 },
    { key: "feeType", label: "Fee Type", w: 28 },
    { key: "cashOnline", label: "Cash/Online", w: 15 },
    { key: "amount", label: "Amount Paid", w: 16 },
    { key: "utr", label: "UTR", w: 20 },
  ] as const;

  const colWidths = cols.map((c) => c.w);
  const widthSum = colWidths.reduce((a, b) => a + b, 0);
  if (widthSum < contentW) {
    const extra = contentW - widthSum;
    colWidths[1] += extra * 0.2;
    colWidths[3] += extra * 0.35;
    colWidths[5] += extra * 0.25;
    colWidths[8] += extra * 0.2;
  } else if (widthSum > contentW) {
    const scale = contentW / widthSum;
    for (let i = 0; i < colWidths.length; i++) colWidths[i] *= scale;
  }

  const logoData = await loadLogoDataUrl(args.logoUrl);

  const drawHeader = () => {
    const logoSize = 20;
    const headerTop = 10;
    const logoGap = 5;
    const logoFmt = logoData ? imageFormatFromDataUrl(logoData) : null;
    let blockBottom = headerTop;

    doc.setTextColor(0, 0, 0);

    if (logoData && logoFmt) {
      try {
        doc.addImage(logoData, logoFmt, margin, headerTop, logoSize, logoSize);
      } catch {
        /* ignore invalid image */
      }
    }

    const textX = logoData ? margin + logoSize + logoGap : margin;
    const textW = pageWidth - margin - textX;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    const nameLines = doc.splitTextToSize(schoolName, textW) as string[];
    let textY = headerTop + 6;
    doc.text(nameLines, textX, textY);
    textY += nameLines.length * 5.2 + 1.5;

    if (addr) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const addrLines = doc.splitTextToSize(addr, textW) as string[];
      doc.text(addrLines.slice(0, 4), textX, textY);
      textY += Math.min(addrLines.length, 4) * 3.6;
    }

    blockBottom = Math.max(headerTop + (logoData ? logoSize : 0), textY);

    const titleY = blockBottom + 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(args.reportTitle, margin, titleY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(args.headerDateLabel, pageWidth - margin, titleY, { align: "right" });

    const lineY = titleY + 5;
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, lineY, pageWidth - margin, lineY);
    return lineY + 6;
  };

  const TABLE_HEADER_H = 9;
  const ROW_H = 7;
  const ROW_LINE_COLOR: [number, number, number] = [220, 220, 220];

  const drawRowSeparator = (yBottom: number) => {
    doc.setDrawColor(...ROW_LINE_COLOR);
    doc.setLineWidth(0.15);
    doc.line(margin, yBottom, pageWidth - margin, yBottom);
  };

  const drawTableHeader = (y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
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
    const headerBottom = y + TABLE_HEADER_H;
    drawRowSeparator(headerBottom);
    doc.setDrawColor(160, 160, 160);
    doc.setLineWidth(0.25);
    doc.line(margin, headerBottom, pageWidth - margin, headerBottom);
    return headerBottom + 1.5;
  };

  const drawSummaryBlock = (startY: number) => {
    const labelX = margin + contentW * 0.52;
    const amountX = pageWidth - margin;
    let y = startY + 4;
    const lineH = 5;
    const fmt = (n: number) => roundRupee(n).toLocaleString("en-IN");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);

    const drawSection = (title: string, total: number, getAmt: (bucket: SummaryBucketLabel) => number) => {
      doc.text(title, labelX, y);
      doc.text(fmt(total), amountX, y, { align: "right" });
      y += lineH;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      for (const bucket of model.summaryBuckets) {
        const amt = getAmt(bucket);
        doc.text(bucket, labelX + 3, y);
        doc.text(fmt(amt), amountX, y, { align: "right" });
        y += lineH;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      y += 1;
    };

    drawSection("Cash", model.cashTotal, (b) => model.summary.get(b)?.cash ?? 0);
    drawSection("Online", model.onlineTotal, (b) => model.summary.get(b)?.online ?? 0);
    if (model.otherTotal > 0.00001) {
      drawSection("Cheque / DD / Others", model.otherTotal, (b) => model.summary.get(b)?.otherMode ?? 0);
    }

    doc.setFontSize(10);
    doc.text("Total Collection", labelX, y);
    doc.text(fmt(model.totalCollection), amountX, y, { align: "right" });
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Signature of Chairman", margin, y);
    doc.text("Signature of Cashier", pageWidth - margin, y, { align: "right" });
    return y;
  };

  let y = drawHeader();
  y = drawTableHeader(y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);

  const summaryBlockH = 28 + model.summaryBuckets.length * 10;
  const pageBottomMargin = 8;

  for (let i = 0; i < model.detailRows.length; i++) {
    if (y + ROW_H > pageHeight - pageBottomMargin) {
      doc.addPage();
      paintWhitePage();
      y = drawTableHeader(10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
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
    const singleLineCols = new Set([0, 1, 2, 4, 6]);
    values.forEach((val, idx) => {
      const w = colWidths[idx];
      const cellText =
        typeof val === "number" ? roundRupee(val).toLocaleString("en-IN") : String(val);
      if (idx === values.length - 2) {
        drawPdfSingleLineCell(doc, cellText, x, textY, w, "right");
      } else if (singleLineCols.has(idx)) {
        drawPdfSingleLineCell(doc, cellText, x, textY, w);
      } else {
        doc.text(doc.splitTextToSize(cellText, Math.max(4, w - 2))[0] || "-", x + 1, textY);
      }
      x += w;
    });
    y += ROW_H;
    drawRowSeparator(y);
  }

  if (y + summaryBlockH > pageHeight - 10) {
    doc.addPage();
    paintWhitePage();
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

  const { summary, summaryBuckets, cashTotal, onlineTotal, otherTotal, totalCollection } = model;

  push(Array(TABLE_COLS).fill(""));

  pushSummarySection(rows, padRow, summaryBuckets, "Cash", cashTotal, (b) => summary.get(b)?.cash ?? 0);
  pushSummarySection(rows, padRow, summaryBuckets, "Online", onlineTotal, (b) => summary.get(b)?.online ?? 0);

  if (otherTotal > 0.00001) {
    pushSummarySection(
      rows,
      padRow,
      summaryBuckets,
      "Cheque / DD / Others",
      otherTotal,
      (b) => summary.get(b)?.otherMode ?? 0
    );
  }

  const totRow = Array(TABLE_COLS).fill("");
  totRow[SUMMARY_LABEL_COL] = "Total Collection";
  totRow[SUMMARY_AMOUNT_COL] = totalCollection;
  push(padRow(totRow));

  push(Array(TABLE_COLS).fill(""));
  push(["Signature of Chairman", "", "", "", "", "", "", "", "Signature of Cashier"]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 36 },
  ];

  XLSX.utils.book_append_sheet(workbook, ws, sheetName);
}
