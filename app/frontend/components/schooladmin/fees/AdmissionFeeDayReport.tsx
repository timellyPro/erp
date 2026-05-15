"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { CalendarDays, FileSpreadsheet, FileText } from "lucide-react";

type GroupMode = "day" | "month";

type ApplicationRow = {
  applicationNo: string;
  applicantName: string;
  classOrGrade: string;
  admissionFee: number;
  paidAtIso: string;
  paymentMode: string | null;
  paymentMethod: string | null;
};

type Bucket = { period: string; count: number; amount: number };

type ChannelTotals = { count: number; amount: number };

type ReportPayload = {
  from: string;
  to: string;
  applications: ApplicationRow[];
  byDay: Bucket[];
  byMonth: Bucket[];
  totals: { count: number; amount: number };
  totalsByChannel?: Partial<{ cash: ChannelTotals; online: ChannelTotals }>;
};

function defaultDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 89);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

type SchoolMeta = { name: string; logoUrl: string | null };

async function fetchSchoolMeta(): Promise<SchoolMeta> {
  try {
    const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
    const data = await res.json();
    return {
      name: data?.school?.name || "School",
      logoUrl: data?.school?.logoUrl || data?.school?.admins?.[0]?.photoUrl || null,
    };
  } catch {
    return { name: "School", logoUrl: null };
  }
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
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
}

type PdfAlign = "left" | "center" | "right";
type Rgb = [number, number, number];

function formatReportYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatSummaryPeriod(period: string, groupMode: GroupMode): string {
  if (groupMode === "month" && /^\d{4}-\d{2}$/.test(period)) {
    const d = new Date(`${period}-01T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    }
  }
  if (groupMode === "day" && /^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return formatReportYmd(period);
  }
  return period;
}

function formatInrPdf(amount: number): string {
  return `₹ ${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatPaymentModePdf(mode: string | null): string {
  const m = String(mode ?? "").trim().toUpperCase();
  if (m === "ONLINE") return "Online";
  if (m === "OFFLINE") return "Offline";
  return m ? m.charAt(0) + m.slice(1).toLowerCase() : "—";
}

/** Short label for PDF cells (UPI ref details go on second line if needed). */
function formatPaymentMethodPdf(method: string | null): { primary: string; detail?: string } {
  const raw = String(method ?? "").trim();
  if (!raw) return { primary: "—" };
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  const head = (parts[0] ?? "").toUpperCase();
  let primary = head.replace(/_/g, " ");
  if (primary === "BANK TRANSFER") primary = "Bank transfer";
  if (primary === "CASH") primary = "Cash";
  if (primary === "UPI") primary = "UPI";
  const refPart = parts.find((p) => p.toUpperCase().startsWith("REF:"));
  if (refPart) {
    return { primary, detail: refPart.replace(/^REF:\s*/i, "Ref: ") };
  }
  return { primary };
}

function columnWidths(total: number, ratios: number[]): number[] {
  const sum = ratios.reduce((a, b) => a + b, 0);
  const widths = ratios.map((r) => Math.floor(((total * r) / sum) * 10) / 10);
  const used = widths.slice(0, -1).reduce((a, b) => a + b, 0);
  widths[widths.length - 1] = Math.round((total - used) * 10) / 10;
  return widths;
}

/** Premium PDF export: branded header, KPI cards, tables with zebra rows & pagination. */
async function exportAdmissionFeeReportPdf(
  data: ReportPayload,
  groupMode: GroupMode,
  buckets: Bucket[]
): Promise<void> {
  const school = await fetchSchoolMeta();
  const logoDataUrl = school.logoUrl ? await loadImageAsDataUrl(school.logoUrl) : null;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const m = 12;
  const contentW = W - m * 2;
  let page = 1;

  const ink = { slate: [15, 23, 42] as [number, number, number], teal: [13, 148, 136] as [number, number, number] };
  const paper = [248, 250, 252] as [number, number, number];
  const line = [226, 232, 240] as [number, number, number];
  const text = [30, 41, 59] as [number, number, number];
  const muted = [100, 116, 139] as [number, number, number];

  const drawPageBackground = () => {
    doc.setFillColor(...paper);
    doc.rect(0, 0, W, H, "F");
  };

  const periodLabel = `${formatReportYmd(data.from)} – ${formatReportYmd(data.to)}`;

  const drawHeroHeader = () => {
    doc.setFillColor(...ink.slate);
    doc.rect(0, 0, W, 38, "F");
    doc.setFillColor(...ink.teal);
    doc.rect(0, 38, W, 1.8, "F");

    const titleX = logoDataUrl ? m + 22 : m;
    if (logoDataUrl) {
      const fmt = logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      try {
        doc.addImage(logoDataUrl, fmt, m, 10, 16, 16);
      } catch {
        /* ignore */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(school.name, titleX, 15);
    doc.setFontSize(16);
    doc.text("Admission Fee Collection Report", titleX, 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(180, 200, 220);
    const viewLabel = groupMode === "day" ? "Date-wise summary" : "Month-wise summary";
    doc.text(periodLabel, W - m, 14, { align: "right" });
    doc.text(viewLabel, W - m, 21, { align: "right" });
    doc.setFontSize(8);
    doc.text(
      `Generated ${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`,
      W - m,
      31,
      { align: "right" }
    );
  };

  const drawContinuationHeader = () => {
    doc.setFillColor(...ink.slate);
    doc.rect(0, 0, W, 14, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${school.name} · Admission fees`, m, 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 210, 220);
    doc.text(`${periodLabel} · page ${page}`, W - m, 9, { align: "right" });
  };

  let y = 46;

  const stampFooter = () => {
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.setFont("helvetica", "normal");
    doc.text("Timelly · Confidential school report. Amounts in INR.", m, H - 6);
    doc.text(`Page ${page}`, W - m, H - 6, { align: "right" });
  };

  const newPage = () => {
    stampFooter();
    doc.addPage();
    page += 1;
    drawPageBackground();
    drawContinuationHeader();
    y = 22;
  };

  /** If a page break runs, optional callback redraws the active table header on the new page. */
  const ensureSpace = (need: number, onAfterBreak?: () => void) => {
    if (y + need > H - 14) {
      newPage();
      onAfterBreak?.();
    }
  };

  drawPageBackground();
  drawHeroHeader();

  const drawKpiCard = (
    x: number,
    cy: number,
    w: number,
    h: number,
    title: string,
    lines: string[],
    accent: boolean
  ) => {
    doc.setDrawColor(...line);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cy, w, h, 3, 3, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(title, x + 5, cy + 8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(accent ? ink.teal : text));
    let vy = cy + 15;
    lines.forEach((line, li) => {
      doc.setFontSize(li === 0 ? (accent ? 14 : 12) : 8.5);
      doc.setFont("helvetica", li === 0 ? "bold" : "normal");
      if (li > 0) doc.setTextColor(...muted);
      const wrapped = doc.splitTextToSize(line, w - 10);
      doc.text(wrapped, x + 5, vy);
      vy += wrapped.length * (li === 0 ? 5.5 : 4.2);
    });
  };

  const kpiGap = 5;
  const kpiRowH = 26;
  const topCardW = (contentW - kpiGap * 2) / 3;
  const cardY = y;

  drawKpiCard(m, cardY, topCardW, kpiRowH, "Applications (paid)", [String(data.totals.count)], false);
  drawKpiCard(
    m + topCardW + kpiGap,
    cardY,
    topCardW,
    kpiRowH,
    "Total collected",
    [formatInrPdf(data.totals.amount)],
    true
  );
  drawKpiCard(
    m + (topCardW + kpiGap) * 2,
    cardY,
    topCardW,
    kpiRowH,
    "Reporting period",
    [formatReportYmd(data.from), `to ${formatReportYmd(data.to)}`],
    false
  );

  const cash = data.totalsByChannel?.cash;
  const online = data.totalsByChannel?.online;
  const channelRow: Array<{ title: string; lines: string[] }> = [];
  if (cash) {
    channelRow.push({
      title: "Cash collected",
      lines: [formatInrPdf(cash.amount), `${cash.count} application${cash.count === 1 ? "" : "s"}`],
    });
  }
  if (online) {
    channelRow.push({
      title: "Online collected",
      lines: [formatInrPdf(online.amount), `${online.count} application${online.count === 1 ? "" : "s"}`],
    });
  }

  let kpiBlockH = kpiRowH;
  if (channelRow.length > 0) {
    const chY = cardY + kpiRowH + kpiGap;
    const chW =
      channelRow.length === 1
        ? topCardW
        : (contentW - kpiGap * (channelRow.length - 1)) / channelRow.length;
    channelRow.forEach((card, i) => {
      const x = m + i * (chW + kpiGap);
      drawKpiCard(x, chY, chW, kpiRowH, card.title, card.lines, false);
    });
    kpiBlockH = kpiRowH * 2 + kpiGap;
  }

  y = cardY + kpiBlockH + 10;

  const padX = 3;
  const lineHeightMm = (fontSize: number) => fontSize * 0.352778 * 1.18;

  const colStarts = (widths: number[]) => {
    const xs: number[] = [m];
    for (let i = 0; i < widths.length - 1; i++) xs.push(xs[i]! + widths[i]!);
    return xs;
  };

  const cellBaseline = (rowTop: number, rowH: number, lineCount: number, fontSize: number) => {
    const blockH = lineCount * lineHeightMm(fontSize);
    return rowTop + Math.max(4.5, (rowH - blockH) / 2 + lineHeightMm(fontSize));
  };

  const writeCell = (
    lines: string[],
    colX: number,
    colW: number,
    rowTop: number,
    rowH: number,
    align: PdfAlign,
    opts?: { bold?: boolean; color?: Rgb; fontSize?: number }
  ) => {
    const fontSize = opts?.fontSize ?? 8.5;
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(...(opts?.color ?? text));
    const innerW = colW - padX * 2;
    const anchorX =
      align === "right" ? colX + colW - padX : align === "center" ? colX + colW / 2 : colX + padX;
    let ty = cellBaseline(rowTop, rowH, lines.length, fontSize);
    for (const line of lines) {
      doc.text(line, anchorX, ty, { align, maxWidth: innerW });
      ty += lineHeightMm(fontSize);
    }
  };

  const paintZebraRow = (rowTop: number, rowH: number, idx: number) => {
    if (idx % 2 === 0) doc.setFillColor(255, 255, 255);
    else doc.setFillColor(248, 250, 252);
    doc.rect(m, rowTop, contentW, rowH, "F");
    doc.setDrawColor(...line);
    doc.line(m, rowTop + rowH, m + contentW, rowTop + rowH);
  };

  // Section: Summary table
  ensureSpace(28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...text);
  doc.text(groupMode === "day" ? "Summary by date" : "Summary by month", m, y);
  y += 7;

  const sumWidths = columnWidths(contentW, [54, 16, 30]);
  const sumXs = colStarts(sumWidths);
  const sumAligns: PdfAlign[] = ["left", "center", "right"];
  const sumHeaders = [
    groupMode === "day" ? "Date" : "Month",
    "Applications",
    "Amount",
  ];
  const sumHeaderH = 9;
  const sumRowH = 8;

  const drawSummaryHeader = () => {
    doc.setFillColor(...ink.slate);
    doc.roundedRect(m, y, contentW, sumHeaderH, 1.2, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    sumHeaders.forEach((label, i) => {
      writeCell([label], sumXs[i]!, sumWidths[i]!, y, sumHeaderH, sumAligns[i]!, {
        bold: true,
        color: [255, 255, 255],
        fontSize: 8.5,
      });
    });
    y += sumHeaderH;
  };

  drawSummaryHeader();
  buckets.forEach((b, idx) => {
    ensureSpace(sumRowH + 1, drawSummaryHeader);
    paintZebraRow(y, sumRowH, idx);
    writeCell(
      [formatSummaryPeriod(b.period, groupMode)],
      sumXs[0]!,
      sumWidths[0]!,
      y,
      sumRowH,
      "left"
    );
    writeCell([String(b.count)], sumXs[1]!, sumWidths[1]!, y, sumRowH, "center");
    writeCell(
      [formatInrPdf(b.amount)],
      sumXs[2]!,
      sumWidths[2]!,
      y,
      sumRowH,
      "right",
      { bold: true, color: ink.teal }
    );
    y += sumRowH;
  });
  y += 10;

  // Applications detail
  if (data.applications.length > 0) {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...text);
    doc.text("Application detail", m, y);
    y += 7;

    const dWidths = columnWidths(contentW, [12, 23, 14, 10, 17, 9, 15]);
    const dXs = colStarts(dWidths);
    const dHeaders = ["App. no.", "Applicant", "Class / grade", "Fee", "Paid on", "Mode", "Method"];
    const dAligns: PdfAlign[] = ["left", "left", "left", "right", "left", "center", "left"];
    const detailHeaderH = 9;

    const drawDetailHeader = () => {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(...ink.teal);
      doc.setLineWidth(0.35);
      doc.roundedRect(m, y, contentW, detailHeaderH, 1.2, 1.2, "FD");
      doc.setLineWidth(0.2);
      dHeaders.forEach((label, i) => {
        writeCell([label], dXs[i]!, dWidths[i]!, y, detailHeaderH, dAligns[i]!, {
          bold: true,
          color: [15, 80, 70],
          fontSize: 7.8,
        });
      });
      y += detailHeaderH;
    };

    drawDetailHeader();

    data.applications.forEach((a, idx) => {
      const methodFmt = formatPaymentMethodPdf(a.paymentMethod);
      const methodLines = methodFmt.detail
        ? [methodFmt.primary, methodFmt.detail]
        : [methodFmt.primary];
      const paidLines = doc.splitTextToSize(
        new Date(a.paidAtIso).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        dWidths[4]! - padX * 2
      );
      const nameLines = doc.splitTextToSize(a.applicantName, dWidths[1]! - padX * 2);
      const classLines = doc.splitTextToSize(a.classOrGrade, dWidths[2]! - padX * 2);
      const appNoLines = doc.splitTextToSize(a.applicationNo, dWidths[0]! - padX * 2);
      const lineCount = Math.max(
        1,
        appNoLines.length,
        nameLines.length,
        classLines.length,
        paidLines.length,
        methodLines.length
      );
      const rowHeight = Math.max(8, 3 + lineCount * lineHeightMm(7.5));

      ensureSpace(rowHeight + 1, drawDetailHeader);
      paintZebraRow(y, rowHeight, idx);

      writeCell(appNoLines, dXs[0]!, dWidths[0]!, y, rowHeight, "left", { fontSize: 7.5 });
      writeCell(nameLines, dXs[1]!, dWidths[1]!, y, rowHeight, "left", { fontSize: 7.5 });
      writeCell(classLines, dXs[2]!, dWidths[2]!, y, rowHeight, "left", { fontSize: 7.5 });
      writeCell(
        [formatInrPdf(a.admissionFee)],
        dXs[3]!,
        dWidths[3]!,
        y,
        rowHeight,
        "right",
        { bold: true, color: ink.teal, fontSize: 7.5 }
      );
      writeCell(paidLines, dXs[4]!, dWidths[4]!, y, rowHeight, "left", { fontSize: 7.2 });
      writeCell(
        [formatPaymentModePdf(a.paymentMode)],
        dXs[5]!,
        dWidths[5]!,
        y,
        rowHeight,
        "center",
        { fontSize: 7.5 }
      );
      writeCell(methodLines, dXs[6]!, dWidths[6]!, y, rowHeight, "left", { fontSize: 7.2 });

      y += rowHeight;
    });
  } else {
    ensureSpace(12);
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text("No paid admission fees in this range.", m, y);
    y += 8;
  }

  stampFooter();
  doc.save(`admission-fee-report-${data.from}-to-${data.to}.pdf`);
}

export default function AdmissionFeeDayReport() {
  const [{ from, to }, setRange] = useState(defaultDateRange);
  const [groupMode, setGroupMode] = useState<GroupMode>("day");
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from, to });
      const res = await fetch(`/api/admissions/admission-fee-report?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.message === "string" ? body.message : "Failed to load report");
      setData(body as ReportPayload);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const buckets = useMemo(() => {
    if (!data) return [];
    return groupMode === "day" ? data.byDay : data.byMonth;
  }, [data, groupMode]);

  const channelTotals = data?.totalsByChannel;

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();

    const overviewRows: Array<Record<string, string | number>> = [
      { Metric: "Applications (paid)", Value: data.totals.count },
      { Metric: "Total collected (₹)", Value: Math.round(data.totals.amount * 100) / 100 },
    ];
    if (channelTotals?.cash) {
      overviewRows.push({
        Metric: "Cash collected (₹)",
        Value: Math.round(channelTotals.cash.amount * 100) / 100,
      });
      overviewRows.push({ Metric: "Cash applications", Value: channelTotals.cash.count });
    }
    if (channelTotals?.online) {
      overviewRows.push({
        Metric: "Online collected (₹)",
        Value: Math.round(channelTotals.online.amount * 100) / 100,
      });
      overviewRows.push({ Metric: "Online applications", Value: channelTotals.online.count });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), "Overview");

    const summaryRows = buckets.map((b) => ({
      Period: groupMode === "day" ? b.period : `${b.period}-01`,
      "Applications (count)": b.count,
      "Amount (₹)": Math.round(b.amount * 100) / 100,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), groupMode === "day" ? "By day" : "By month");

    const detailRows = data.applications.map((a) => ({
      "Application No": a.applicationNo,
      "Applicant Name": a.applicantName,
      "Class / grade": a.classOrGrade,
      "Admission fee (₹)": a.admissionFee,
      "Paid on (local)": new Date(a.paidAtIso).toLocaleString("en-IN"),
      Mode: a.paymentMode ?? "—",
      Method: a.paymentMethod ?? "—",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Applications");
    XLSX.writeFile(wb, `admission-fee-report-${data.from}_to_${data.to}.xlsx`);
  };

  const exportPdf = async () => {
    if (!data) return;
    await exportAdmissionFeeReportPdf(data, groupMode, buckets);
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Admission fee day report</h3>
          <p className="mt-1 text-sm text-gray-400">
            Paid admission fees recorded on applications (by paid date). Use date-wise or month-wise totals, then
            export to Excel or PDF.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!data || loading}
            onClick={exportExcel}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </button>
          <button
            type="button"
            disabled={!data || loading}
            onClick={exportPdf}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/35 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            PDF
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4" />
            {loading ? "Loading…" : "Apply range"}
          </button>
        </div>
        <div className="flex rounded-xl border border-white/10 p-1">
          <button
            type="button"
            onClick={() => setGroupMode("day")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              groupMode === "day" ? "bg-lime-500/25 text-lime-100" : "text-gray-400 hover:text-white"
            }`}
          >
            Date-wise
          </button>
          <button
            type="button"
            onClick={() => setGroupMode("month")}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              groupMode === "month" ? "bg-lime-500/25 text-lime-100" : "text-gray-400 hover:text-white"
            }`}
          >
            Month-wise
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>
      ) : null}

      {data && !loading ? (
        <div
          className={`mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 ${
            channelTotals?.cash && channelTotals?.online ? "lg:grid-cols-4" : "lg:grid-cols-3"
          }`}
        >
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs text-gray-400">Applications (paid in range)</p>
            <p className="text-xl font-bold text-white">{data.totals.count}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs text-gray-400">Total admission fee collected</p>
            <p className="text-xl font-bold text-emerald-300">₹{data.totals.amount.toLocaleString("en-IN")}</p>
          </div>
          {channelTotals?.cash ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <p className="text-xs text-amber-200/80">Cash collected</p>
              <p className="text-xl font-bold text-amber-100">
                ₹{channelTotals.cash.amount.toLocaleString("en-IN")}
              </p>
              <p className="mt-0.5 text-xs text-amber-200/60">{channelTotals.cash.count} application(s)</p>
            </div>
          ) : null}
          {channelTotals?.online ? (
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3">
              <p className="text-xs text-sky-200/80">Online collected</p>
              <p className="text-xl font-bold text-sky-100">
                ₹{channelTotals.online.amount.toLocaleString("en-IN")}
              </p>
              <p className="mt-0.5 text-xs text-sky-200/60">{channelTotals.online.count} application(s)</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-gray-400">
              <th className="px-3 py-3 font-medium">{groupMode === "day" ? "Date" : "Month"}</th>
              <th className="px-3 py-3 font-medium text-right">Applications</th>
              <th className="px-3 py-3 font-medium text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : buckets.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-gray-400">
                  No paid admission fees in this range.
                </td>
              </tr>
            ) : (
              buckets.map((b) => (
                <tr key={b.period} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-3 py-2.5 font-mono text-white/90">{b.period}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-200">{b.count}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-300">
                    ₹{b.amount.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.applications.length > 0 ? (
        <div className="mt-6">
          <h4 className="mb-2 text-sm font-semibold text-gray-200">Application detail (paid in range)</h4>
          <div className="max-h-72 overflow-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[640px] text-left text-xs sm:text-sm">
              <thead className="sticky top-0 bg-[#0f172a]/95 backdrop-blur">
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="px-2 py-2 font-medium">App. no.</th>
                  <th className="px-2 py-2 font-medium">Applicant</th>
                  <th className="px-2 py-2 font-medium">Class / grade</th>
                  <th className="px-2 py-2 font-medium text-right">Fee</th>
                  <th className="px-2 py-2 font-medium">Paid on</th>
                  <th className="px-2 py-2 font-medium">Mode</th>
                </tr>
              </thead>
              <tbody>
                {data.applications.map((a) => (
                  <tr key={`${a.applicationNo}-${a.paidAtIso}`} className="border-b border-white/5 hover:bg-white/[0.03]">
                    <td className="px-2 py-2 font-mono text-white/85">{a.applicationNo}</td>
                    <td className="px-2 py-2 text-gray-200">{a.applicantName}</td>
                    <td className="px-2 py-2 text-gray-400">{a.classOrGrade}</td>
                    <td className="px-2 py-2 text-right font-semibold text-emerald-300">
                      ₹{a.admissionFee.toLocaleString("en-IN")}
                    </td>
                    <td className="px-2 py-2 text-gray-300">{new Date(a.paidAtIso).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2 text-gray-400">{a.paymentMode || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
