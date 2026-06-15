"use client";

import { useState } from "react";
import { CalendarDays, Download } from "lucide-react";
import { formatDdMmYyyyFromYmdInput } from "@/lib/feeDayReportExcel";
import type { CollectionByHeadRow } from "@/lib/feeDayReportExcel";
import { exportDayReportXlsx } from "@/lib/exportDayReportXlsx";

type Props = {
  selectedDate: string;
  onDateChange: (ymd: string) => void;
  rows: CollectionByHeadRow[];
  formattedTotal: string;
  loading?: boolean;
};

/** Day-wise fee collection broken down by fee head (installments merged). */
export function DayCollectionByHeadCard({
  selectedDate,
  onDateChange,
  rows,
  formattedTotal,
  loading = false,
}: Props) {
  const [downloading, setDownloading] = useState(false);
  const dateLabel = formatDdMmYyyyFromYmdInput(selectedDate);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const ok = await exportDayReportXlsx(selectedDate);
      if (!ok) {
        alert("No fee transactions found for the selected date.");
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to download day report.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className={`bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 sm:p-6 md:p-8 transition-opacity ${loading ? "opacity-60" : ""}`}
    >
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg md:text-xl font-bold text-white">Day-wise Collection</h3>
          <p className="text-gray-400 text-xs sm:text-sm mt-0.5 sm:mt-1">
            By fee head for {dateLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:justify-end">
          <div className="inline-flex items-center gap-1.5">
            <label
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-2.5 py-2 cursor-pointer hover:bg-white/10"
              title="Select date"
            >
              <CalendarDays className="w-4 h-4 text-lime-400 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="bg-transparent text-white text-xs sm:text-sm font-medium outline-none [color-scheme:dark] w-[8.5rem] sm:w-[9rem]"
                aria-label="Select collection date"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={downloading || loading}
              title="Download day report (Excel)"
              aria-label="Download day report Excel"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-lime-400 hover:bg-white/10 hover:text-lime-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={2.25} />
            </button>
          </div>
          <div className="text-right">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">Total</p>
            <p className="text-xl sm:text-2xl font-bold text-lime-400">₹{formattedTotal}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 py-6 text-center">Loading collection breakdown…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">No collections recorded for this date.</p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[280px] text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2.5 pr-4 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">
                  Fee Head
                </th>
                <th className="text-right py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-gray-500">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5 pr-4 text-white/90 font-medium">{row.label}</td>
                  <td className="py-2.5 text-right text-white font-semibold tabular-nums">
                    ₹{row.formattedAmount}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-white/15">
                <td className="pt-3 pb-1 pr-4 text-white font-bold">Total</td>
                <td className="pt-3 pb-1 text-right text-lime-400 font-bold tabular-nums">
                  ₹{formattedTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
