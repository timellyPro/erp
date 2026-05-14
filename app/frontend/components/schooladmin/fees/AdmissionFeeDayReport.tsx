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

type ReportPayload = {
  from: string;
  to: string;
  applications: ApplicationRow[];
  byDay: Bucket[];
  byMonth: Bucket[];
  totals: { count: number; amount: number };
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

  const drawHeroHeader = () => {
    doc.setFillColor(...ink.slate);
    doc.rect(0, 0, W, 36, "F");
    doc.setFillColor(...ink.teal);
    doc.rect(0, 36, W, 1.8, "F");

    const titleX = logoDataUrl ? m + 22 : m;
    if (logoDataUrl) {
      const fmt = logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      try {
        doc.addImage(logoDataUrl, fmt, m, 9, 16, 16);
      } catch {
        /* ignore */
      }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(school.name, titleX, 14);
    doc.setFontSize(17);
    doc.text("Admission fee collection report", titleX, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(180, 200, 220);
    const periodLabel = `${data.from}  →  ${data.to}`;
    const viewLabel = groupMode === "day" ? "Date-wise totals" : "Month-wise totals";
    doc.text(periodLabel, W - m, 14, { align: "right" });
    doc.text(viewLabel, W - m, 20, { align: "right" });
    doc.setFontSize(8);
    doc.text(`Generated ${new Date().toLocaleString("en-IN")}`, W - m, 30, { align: "right" });
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
    doc.text(`${data.from} → ${data.to} · page ${page}`, W - m, 9, { align: "right" });
  };

  let y = 44;

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

  // KPI cards
  const cardY = y;
  const cardH = 22;
  const gap = 4;
  const cardW = (contentW - gap * 2) / 3;
  const round = 3;
  const drawCard = (i: number, title: string, value: string, accent: boolean) => {
    const x = m + i * (cardW + gap);
    doc.setDrawColor(...line);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, cardW, cardH, round, round, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(title, x + 4, cardY + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(accent ? 13 : 12);
    doc.setTextColor(...(accent ? ink.teal : text));
    doc.text(value, x + 4, cardY + 16);
  };
  drawCard(0, "Applications (paid)", String(data.totals.count), false);
  drawCard(1, "Total collected", `₹ ${data.totals.amount.toLocaleString("en-IN")}`, true);
  drawCard(2, "Reporting window", `${data.from} to ${data.to}`, false);
  y = cardY + cardH + 10;

  // Section: Summary table
  ensureSpace(28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...text);
  doc.text(groupMode === "day" ? "Summary by date" : "Summary by month", m, y);
  y += 6;

  const wPeriod = contentW * 0.5;
  const sumHeaderH = 8;
  const rowH = 7.5;
  const amountRightX = m + contentW - 4;

  const drawSummaryHeader = () => {
    doc.setFillColor(...ink.slate);
    doc.roundedRect(m, y, contentW, sumHeaderH, 1.2, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(groupMode === "day" ? "Date" : "Month", m + 3, y + 5.3);
    doc.text("Applications", m + wPeriod + 2, y + 5.3);
    doc.text("Amount (₹)", amountRightX, y + 5.3, { align: "right" });
    y += sumHeaderH;
  };

  drawSummaryHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  buckets.forEach((b, idx) => {
    ensureSpace(rowH + 1, drawSummaryHeader);
    if (idx % 2 === 0) {
      doc.setFillColor(255, 255, 255);
      doc.rect(m, y, contentW, rowH, "F");
    } else {
      doc.setFillColor(248, 250, 252);
      doc.rect(m, y, contentW, rowH, "F");
    }
    doc.setDrawColor(...line);
    doc.line(m, y + rowH, m + contentW, y + rowH);
    doc.setTextColor(...text);
    doc.text(b.period, m + 3, y + 5.2, { maxWidth: wPeriod - 4 });
    doc.text(String(b.count), m + wPeriod + 2, y + 5.2);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ink.teal);
    doc.text(`₹ ${b.amount.toLocaleString("en-IN")}`, amountRightX, y + 5.2, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...text);
    y += rowH;
  });
  y += 8;

  // Applications detail
  if (data.applications.length > 0) {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...text);
    doc.text("Application detail", m, y);
    y += 6;

    const dCols = [34, 62, 34, 28, 40, 22, 38];
    const dHeader = ["App. no.", "Applicant", "Class / grade", "Fee (₹)", "Paid on", "Mode", "Method"];
    const detailHeaderH = 8;

    const drawDetailHeader = () => {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(...ink.teal);
      doc.setLineWidth(0.35);
      doc.roundedRect(m, y, contentW, detailHeaderH, 1.2, 1.2, "FD");
      doc.setLineWidth(0.2);
      doc.setTextColor(15, 80, 70);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.8);
      let hx = m + 2.5;
      dHeader.forEach((h, i) => {
        const align = i >= 3 && i <= 4 ? "center" : i === 3 ? "right" : "left";
        const tw = dCols[i] - 3;
        if (align === "right") doc.text(h, hx + dCols[i] - 2, y + 5.2, { align: "right" });
        else if (align === "center") doc.text(h, hx + dCols[i] / 2, y + 5.2, { align: "center" });
        else doc.text(h, hx, y + 5.2, { maxWidth: tw });
        hx += dCols[i];
      });
      y += detailHeaderH;
    };

    drawDetailHeader();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    const lh =
      (typeof doc.getLineHeightFactor === "function" ? doc.getLineHeightFactor() : 1.12) * 7.6 * 0.352778;

    data.applications.forEach((a, idx) => {
      const nameLines = doc.splitTextToSize(a.applicantName, dCols[1] - 3);
      const classLines = doc.splitTextToSize(a.classOrGrade, dCols[2] - 2);
      const modeStr = a.paymentMode || "—";
      const methodStr = a.paymentMethod || "—";
      const methodLines = doc.splitTextToSize(methodStr, dCols[6] - 2);
      const rowInner = Math.max(1, nameLines.length, classLines.length, methodLines.length);
      const rowHeight = Math.max(7.5, 4 + rowInner * lh);

      ensureSpace(rowHeight + 1, drawDetailHeader);
      if (idx % 2 === 0) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(248, 250, 252);
      }
      doc.rect(m, y, contentW, rowHeight, "F");
      doc.setDrawColor(...line);
      doc.line(m, y + rowHeight, m + contentW, y + rowHeight);

      doc.setTextColor(...text);
      let rx = m + 2.5;
      doc.text(a.applicationNo, rx, y + 5, { maxWidth: dCols[0] - 2 });
      rx += dCols[0];
      doc.text(nameLines, rx, y + 4.5);
      rx += dCols[1];
      doc.text(classLines, rx, y + 4.5);
      rx += dCols[2];
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ink.teal);
      doc.text(`₹${a.admissionFee.toLocaleString("en-IN")}`, rx + dCols[3] - 2, y + 5, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...text);
      rx += dCols[3];
      doc.text(new Date(a.paidAtIso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }), rx, y + 5, {
        maxWidth: dCols[4] - 2,
      });
      rx += dCols[4];
      doc.text(modeStr, rx, y + 5, { maxWidth: dCols[5] - 2 });
      rx += dCols[5];
      doc.text(methodLines, rx, y + 4.5);
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

  const exportExcel = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
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
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs text-gray-400">Applications (paid in range)</p>
            <p className="text-xl font-bold text-white">{data.totals.count}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-xs text-gray-400">Total admission fee collected</p>
            <p className="text-xl font-bold text-emerald-300">₹{data.totals.amount.toLocaleString("en-IN")}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 sm:col-span-1">
            <p className="text-xs text-gray-400">Export</p>
            <p className="text-sm text-gray-300">
              Excel includes summary + every application row. PDF includes summary and the first page of applications.
            </p>
          </div>
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
