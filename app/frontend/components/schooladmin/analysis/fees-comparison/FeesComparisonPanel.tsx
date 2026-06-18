"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { CalendarDays, Download, FileSpreadsheet, FileText } from "lucide-react";
import Spinner from "@/app/frontend/components/common/Spinner";
import AnalysisSectionNav from "../../AnalysisSectionNav";
import {
  loadFeesComparisonReport,
  peekFeesComparisonReport,
  type FeesComparisonQuery,
} from "@/lib/loadFeesComparisonReport";

type ComparisonRow = {
  key: string;
  category: "FEES" | "PETTY_CASH";
  head: string;
  rangeAAmount: number;
  rangeBAmount: number;
  difference: number;
  rangeACount: number;
  rangeBCount: number;
};

type ComparisonReport = {
  rangeA: { from: string; to: string };
  rangeB: { from: string; to: string };
  rows: ComparisonRow[];
  totals: {
    rangeAAmount: number;
    rangeBAmount: number;
    difference: number;
  };
};

type SchoolMeta = {
  name: string;
  address: string;
  logoUrl: string | null;
};

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatInr(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function rangeLabel(range: { from: string; to: string }) {
  return `${formatDate(range.from)} - ${formatDate(range.to)}`;
}

function normalizeLogoUrl(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  let url = raw.trim();
  if (url.includes("/storage/v1/object/")) {
    url = `/api/media?url=${encodeURIComponent(url)}`;
  }
  if (url.startsWith("/") && typeof window !== "undefined") {
    url = `${window.location.origin}${url}`;
  }
  return url;
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
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

async function fetchSchoolMeta(): Promise<SchoolMeta> {
  try {
    const res = await fetch("/api/school/mine", { credentials: "include", cache: "no-store" });
    const data = await res.json();
    const school = data?.school ?? {};
    const addressParts = [school.address, school.location]
      .filter((v: unknown) => typeof v === "string" && String(v).trim())
      .map((v: unknown) => String(v).trim());
    const address = addressParts
      .filter((part, idx) => addressParts.findIndex((x) => x.toLowerCase() === part.toLowerCase()) === idx)
      .join(", ");
    return {
      name: String(school.name || "School"),
      address: address || "Address not available",
      logoUrl: normalizeLogoUrl(
        typeof school.logoUrl === "string" && school.logoUrl.trim()
          ? school.logoUrl
          : school.admins?.[0]?.photoUrl ?? null
      ),
    };
  } catch {
    return { name: "School", address: "Address not available", logoUrl: null };
  }
}

function exportExcel(report: ComparisonReport) {
  const rows = report.rows.map((row) => ({
    Type: row.category === "PETTY_CASH" ? "Petty cash" : "Fees",
    Head: row.head,
    [`Range 1 (${rangeLabel(report.rangeA)})`]: row.rangeAAmount,
    [`Range 2 (${rangeLabel(report.rangeB)})`]: row.rangeBAmount,
    Difference: row.difference,
    "Range 1 Count": row.rangeACount,
    "Range 2 Count": row.rangeBCount,
  }));

  rows.push({
    Type: "Total",
    Head: "Total",
    [`Range 1 (${rangeLabel(report.rangeA)})`]: report.totals.rangeAAmount,
    [`Range 2 (${rangeLabel(report.rangeB)})`]: report.totals.rangeBAmount,
    Difference: report.totals.difference,
    "Range 1 Count": 0,
    "Range 2 Count": 0,
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 14 },
    { wch: 30 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, "Fees Comparison");
  XLSX.writeFile(wb, `fees-comparison-${report.rangeA.from}_vs_${report.rangeB.from}.xlsx`);
}

async function exportPdf(report: ComparisonReport) {
  const school = await fetchSchoolMeta();
  const logoData = school.logoUrl ? await loadImageAsDataUrl(school.logoUrl) : null;
  const logoFormat = logoData?.startsWith("data:image/jpeg")
    ? "JPEG"
    : logoData?.startsWith("data:image/webp")
      ? "WEBP"
      : "PNG";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const col = {
    type: margin + 2,
    head: margin + 26,
    rangeA: margin + 104,
    rangeB: margin + 132,
    diff: margin + 160,
    count: margin + 184,
  };

  const drawHeader = (pageNo: number) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    if (logoData) {
      try {
        doc.addImage(logoData, logoFormat, margin, 10, 18, 18);
      } catch {
        // Ignore unsupported image data.
      }
    }

    const titleX = logoData ? margin + 24 : margin;
    const maxSchoolTextWidth = pageWidth - titleX - margin;
    const addressLines = doc.splitTextToSize(school.address, maxSchoolTextWidth).slice(0, 2);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(school.name, titleX, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(addressLines, titleX, 20);

    doc.setDrawColor(0, 0, 0);
    doc.line(margin, 31, pageWidth - margin, 31);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Fees Comparison Report", pageWidth / 2, 39, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")} | Page ${pageNo}`, pageWidth / 2, 45, { align: "center" });

    const cardY = 53;
    const cardW = (pageWidth - margin * 2 - 6) / 3;
    const cards = [
      { label: "Range 1", value: formatInr(report.totals.rangeAAmount), sub: rangeLabel(report.rangeA) },
      { label: "Range 2", value: formatInr(report.totals.rangeBAmount), sub: rangeLabel(report.rangeB) },
      { label: "Difference", value: formatInr(report.totals.difference), sub: "Range 2 minus Range 1" },
    ] as const;
    cards.forEach((card, idx) => {
      const x = margin + idx * (cardW + 3);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(0, 0, 0);
      doc.rect(x, cardY, cardW, 22, "S");
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.text(card.label.toUpperCase(), x + 4, cardY + 6);
      doc.setFontSize(11);
      doc.text(card.value, x + 4, cardY + 12.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(doc.splitTextToSize(card.sub, cardW - 8)[0] ?? card.sub, x + 4, cardY + 17);
    });

    doc.setDrawColor(0, 0, 0);
    doc.line(margin, 84, pageWidth - margin, 84);
    doc.line(margin, 93, pageWidth - margin, 93);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("TYPE", col.type, 90);
    doc.text("HEAD", col.head, 90);
    doc.text("RANGE 1", col.rangeA, 90, { align: "right" });
    doc.text("RANGE 2", col.rangeB, 90, { align: "right" });
    doc.text("DIFF", col.diff, 90, { align: "right" });
    doc.text("COUNT", col.count, 90, { align: "right" });
  };

  let y = 101;
  let pageNo = 1;
  drawHeader(pageNo);

  const drawFooter = () => {
    doc.setDrawColor(0, 0, 0);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Timelly School ERP", margin, pageHeight - 6);
    doc.text(`Page ${pageNo}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  };

  const drawRow = (row: ComparisonRow | null, index: number) => {
    if (y > pageHeight - 18) {
      drawFooter();
      doc.addPage();
      pageNo += 1;
      y = 101;
      drawHeader(pageNo);
    }
    const isTotal = row === null;

    doc.setFont("helvetica", isTotal ? "bold" : "normal");
    doc.setFontSize(7.2);
    const type = isTotal ? "Total" : row.category === "PETTY_CASH" ? "Petty cash" : "Fees";
    const head = isTotal ? "Total" : row.head;
    const rangeAAmount = isTotal ? report.totals.rangeAAmount : row.rangeAAmount;
    const rangeBAmount = isTotal ? report.totals.rangeBAmount : row.rangeBAmount;
    const difference = isTotal ? report.totals.difference : row.difference;
    const countText = isTotal ? "-" : `${row.rangeACount}/${row.rangeBCount}`;

    doc.setTextColor(0, 0, 0);
    if (isTotal) {
      doc.setDrawColor(0, 0, 0);
      doc.line(margin, y - 5, pageWidth - margin, y - 5);
    }
    doc.text(type, col.type, y);
    doc.text(doc.splitTextToSize(head, 74)[0] ?? head, col.head, y);
    doc.text(Math.round(rangeAAmount).toLocaleString("en-IN"), col.rangeA, y, { align: "right" });
    doc.text(Math.round(rangeBAmount).toLocaleString("en-IN"), col.rangeB, y, { align: "right" });
    doc.text(Math.round(difference).toLocaleString("en-IN"), col.diff, y, { align: "right" });
    doc.text(countText, col.count, y, { align: "right" });
    y += 6.5;
  };

  report.rows.forEach((row, index) => drawRow(row, index));
  y += 2;
  drawRow(null, report.rows.length);
  drawFooter();
  doc.save(`fees-comparison-${report.rangeA.from}_vs_${report.rangeB.from}.pdf`);
}

export default function FeesComparisonPanel() {
  const { data: session } = useSession();
  const schoolId = session?.user?.schoolId ?? null;
  const today = useMemo(() => todayYmd(), []);
  const [rangeAFrom, setRangeAFrom] = useState(today);
  const [rangeATo, setRangeATo] = useState(today);
  const [rangeBFrom, setRangeBFrom] = useState(today);
  const [rangeBTo, setRangeBTo] = useState(today);
  const defaultQuery = useMemo<FeesComparisonQuery>(
    () => ({ rangeAFrom: today, rangeATo: today, rangeBFrom: today, rangeBTo: today }),
    [today]
  );
  const [report, setReport] = useState<ComparisonReport | null>(() =>
    peekFeesComparisonReport(null, defaultQuery)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentQuery = useMemo<FeesComparisonQuery>(
    () => ({ rangeAFrom, rangeATo, rangeBFrom, rangeBTo }),
    [rangeAFrom, rangeATo, rangeBFrom, rangeBTo]
  );

  const loadReport = useCallback(async (options?: { revalidate?: boolean; signal?: AbortSignal }) => {
    const cached = !options?.revalidate ? peekFeesComparisonReport(schoolId, currentQuery) : null;
    if (cached) {
      setReport(cached);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await loadFeesComparisonReport(schoolId, currentQuery, {
        revalidate: options?.revalidate,
        signal: options?.signal,
      });
      setReport(result.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load comparison");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [currentQuery, schoolId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadReport({ signal: controller.signal });
    return () => controller.abort();
  }, [loadReport]);

  const hasRows = (report?.rows.length ?? 0) > 0;

  return (
    <div className="p-4 text-white sm:p-6">
      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-2xl sm:p-5">
        <div className="mb-3 border-b border-white/10 pb-3">
          <p className="text-sm font-semibold tracking-tight text-white sm:text-base">Analysis</p>
          <p className="mt-0.5 text-xs text-white/55 sm:text-sm">
            Compare fee and petty cash collections across two custom date ranges.
          </p>
        </div>
        <AnalysisSectionNav embedded />
      </div>

      <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:rounded-2xl sm:p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Fees Comparison</h2>
            <p className="mt-1 text-sm text-white/55">
              Compare two date ranges across admission, tuition, mess, hostel, transport, other fee heads, and petty cash accounts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!report || loading}
              onClick={() => report && exportExcel(report)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
            <button
              type="button"
              disabled={!report || loading}
              onClick={() => report && exportPdf(report)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/35 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              PDF
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Range 1</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DateField label="From" value={rangeAFrom} onChange={setRangeAFrom} />
              <DateField label="To" value={rangeATo} onChange={setRangeATo} />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">Range 2</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <DateField label="From" value={rangeBFrom} onChange={setRangeBFrom} />
              <DateField label="To" value={rangeBTo} onChange={setRangeBTo} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadReport({ revalidate: true })}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4" />
            {loading ? "Loading..." : "Compare"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:rounded-2xl sm:p-5">
        {loading && !report ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <SummaryCard label="Range 1 total" value={formatInr(report?.totals.rangeAAmount ?? 0)} />
              <SummaryCard label="Range 2 total" value={formatInr(report?.totals.rangeBAmount ?? 0)} />
              <SummaryCard
                label="Difference"
                value={formatInr(report?.totals.difference ?? 0)}
                tone={(report?.totals.difference ?? 0) >= 0 ? "positive" : "negative"}
              />
            </div>

            <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] font-bold uppercase tracking-wider text-white/45">
                    <th className="py-3 pr-3 font-medium">Type</th>
                    <th className="px-2 py-3 font-medium">Head</th>
                    <th className="px-2 py-3 text-right font-medium">Range 1</th>
                    <th className="px-2 py-3 text-right font-medium">Range 2</th>
                    <th className="px-2 py-3 text-right font-medium">Difference</th>
                    <th className="py-3 pl-2 text-right font-medium">Count</th>
                  </tr>
                </thead>
                <tbody className="text-white/90">
                  {!hasRows ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-white/40">
                        No fee or petty cash data found for these ranges.
                      </td>
                    </tr>
                  ) : (
                    report?.rows.map((row) => (
                      <tr key={row.key} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                        <td className="py-3 pr-3 text-xs font-semibold uppercase tracking-wide text-white/45">
                          {row.category === "PETTY_CASH" ? "Petty cash" : "Fees"}
                        </td>
                        <td className="px-2 py-3 font-semibold text-white">{row.head}</td>
                        <td className="px-2 py-3 text-right tabular-nums text-sky-200">
                          {formatInr(row.rangeAAmount)}
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums text-lime-200">
                          {formatInr(row.rangeBAmount)}
                        </td>
                        <td
                          className={`px-2 py-3 text-right tabular-nums font-semibold ${
                            row.difference >= 0 ? "text-lime-300" : "text-rose-300"
                          }`}
                        >
                          {formatInr(row.difference)}
                        </td>
                        <td className="py-3 pl-2 text-right tabular-nums text-white/55">
                          {row.rangeACount} / {row.rangeBCount}
                        </td>
                      </tr>
                    ))
                  )}
                  {hasRows && report ? (
                    <tr className="border-t border-white/20 bg-white/6 font-bold">
                      <td className="py-3 pr-3 text-white">Total</td>
                      <td className="px-2 py-3 text-white">All heads</td>
                      <td className="px-2 py-3 text-right tabular-nums text-sky-200">
                        {formatInr(report.totals.rangeAAmount)}
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-lime-200">
                        {formatInr(report.totals.rangeBAmount)}
                      </td>
                      <td
                        className={`px-2 py-3 text-right tabular-nums ${
                          report.totals.difference >= 0 ? "text-lime-300" : "text-rose-300"
                        }`}
                      >
                        {formatInr(report.totals.difference)}
                      </td>
                      <td className="py-3 pl-2 text-right text-white/40">-</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-white/50">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white scheme-dark"
      />
    </label>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueColor =
    tone === "positive" ? "text-lime-300" : tone === "negative" ? "text-rose-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">{label}</p>
      <p className={`mt-1 text-lg font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}
