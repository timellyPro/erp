"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import type { StudentFeeDueReport } from "@/lib/fees/buildStudentFeeDueReport";
import { fetchMyDueReport } from "@/lib/api/parentDueReport";
import { formatRupee } from "./parentFeesHelpers";

/** Same figures as the school's Fee Due Report, for this student: each head with fee, concession, paid and due. */
export function DueReportSection() {
  const [report, setReport] = useState<StudentFeeDueReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchMyDueReport()
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok || !data.report) {
          setError(data.message || "Could not load the fee due report");
          return;
        }
        setReport(data.report);
      })
      .catch(() => {
        if (active) setError("Could not load the fee due report");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-lime-400 shrink-0" />
          Fee due report
        </h3>
        {report && (
          <span className="text-xs sm:text-sm text-gray-400">
            Amount to pay: <span className="text-white font-semibold">{formatRupee(report.totals.due)}</span>
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse" aria-label="Loading fee due report">
          <div className="h-9 rounded-lg bg-white/5" />
          <div className="h-9 rounded-lg bg-white/5" />
          <div className="h-9 rounded-lg bg-white/5" />
        </div>
      ) : error || !report ? (
        <p className="text-sm text-amber-400">{error}</p>
      ) : report.heads.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">No fees assigned yet.</p>
      ) : (
        <>
          <div className="rounded-xl border border-white/10 overflow-x-auto">
            <table className="w-full text-xs sm:text-sm min-w-[420px]">
              <thead>
                <tr className="bg-white/5 text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-3 sm:px-4 py-3 font-medium text-left">Fee head</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right">Fee</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right">Concession</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-right">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {report.heads.map((h) => (
                  <tr key={h.key}>
                    <td className="px-3 sm:px-4 py-3 text-gray-200">{h.label}</td>
                    <td className="px-3 sm:px-4 py-3 text-right text-white">{formatRupee(h.fee)}</td>
                    <td className="px-3 sm:px-4 py-3 text-right text-gray-300">{formatRupee(h.concession)}</td>
                    <td className="px-3 sm:px-4 py-3 text-right text-emerald-400">{formatRupee(h.paid)}</td>
                    <td className="px-3 sm:px-4 py-3 text-right text-white font-medium">{formatRupee(h.due)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-white/5 font-semibold">
                  <td className="px-3 sm:px-4 py-3 text-white">Total</td>
                  <td className="px-3 sm:px-4 py-3 text-right text-white">{formatRupee(report.totals.fee)}</td>
                  <td className="px-3 sm:px-4 py-3 text-right text-gray-300">{formatRupee(report.totals.discount)}</td>
                  <td className="px-3 sm:px-4 py-3 text-right text-emerald-400">{formatRupee(report.totals.paid)}</td>
                  <td className="px-3 sm:px-4 py-3 text-right text-lime-300">{formatRupee(report.totals.due)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {report.previousYear && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 sm:p-4 text-xs sm:text-sm">
              <p className="font-semibold text-amber-300">Previous year dues (not included in the total above)</p>
              <p className="text-gray-300 mt-1">
                Fee {formatRupee(report.previousYear.fee)}
                {report.previousYear.concession > 0 && <> · Concession {formatRupee(report.previousYear.concession)}</>}
                {" · "}Paid {formatRupee(report.previousYear.paid)} ·{" "}
                <span className="text-white font-semibold">Due {formatRupee(report.previousYear.due)}</span>
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
