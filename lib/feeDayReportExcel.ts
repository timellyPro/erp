import * as XLSX from "xlsx";
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

  const summary = new Map<string, ModeTotals>();

  for (const tx of sorted) {
    const rec = getReceiptNo(tx.id);
    const admission = (tx.student?.admissionNumber || "").trim() || "-";
    const dateStr = formatDdMmYyyy(tx.createdAt);
    const studentName = (tx.student?.user?.name || "").trim() || "-";
    const cls = classCompact(tx.student?.class || null);
    const gateway = tx.gateway;
    const modeLabel = cashOnlineCell(gateway);
    const utr = utrForRow(gateway, tx.transactionId, tx.hyperpgTxnId);

    const allocations = allocationsForTx(tx);

    for (const al of allocations) {
      const feeName = normalizeAccount(al.name);
      const amt = Number(al.amount || 0);
      addToSummary(summary, feeName, amt, gateway);
      push([
        rec,
        admission,
        dateStr,
        studentName,
        cls,
        feeTypeDisplay(feeName),
        modeLabel,
        Math.round(amt * 100) / 100,
        utr,
      ]);
    }
  }

  const totalCollection = sorted.reduce((s, tx) => {
    const allocations = allocationsForTx(tx);
    return s + allocations.reduce((a, x) => a + Number(x.amount || 0), 0);
  }, 0);

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
  totRow[SUMMARY_AMOUNT_COL] = Math.round(totalCollection * 100) / 100;
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
