"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, FileSpreadsheet, FileText } from "lucide-react";
import { defaultDateRange, type GroupMode, type ReportPayload } from "./shared";
import { exportAdmissionFeeReportExcel } from "./shared";
import { exportAdmissionFeeReportPdf } from "./shared";
import { fetchAdmissionFeeReport } from "@/lib/api/admissionFeeReport";

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
      const { ok, data: body } = await fetchAdmissionFeeReport(from, to);
      if (!ok) throw new Error(typeof body.message === "string" ? body.message : "Failed to load report");
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
    exportAdmissionFeeReportExcel(data, groupMode, buckets);
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
            onClick={() => void exportPdf()}
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
