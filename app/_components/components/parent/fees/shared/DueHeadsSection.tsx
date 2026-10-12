import { Receipt } from "lucide-react";
import { formatRupee, type DueHeadRow } from "./parentFeesHelpers";

function DueHeadCard({ row }: { row: DueHeadRow }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-white leading-snug">{row.label}</p>
        <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${row.status.className}`}>
          {row.status.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-black/20 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Total</p>
          <p className="text-sm font-semibold text-white mt-0.5">{formatRupee(row.total)}</p>
        </div>
        <div className="rounded-lg bg-black/20 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Paid</p>
          <p className="text-sm font-semibold text-emerald-400 mt-0.5">{formatRupee(row.paid)}</p>
        </div>
        <div className="rounded-lg bg-black/20 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-gray-500">Due</p>
          <p className="text-sm font-semibold text-lime-300 mt-0.5">{formatRupee(row.due)}</p>
        </div>
      </div>
    </div>
  );
}

export function DueHeadsSection({ dueHeadRows, totalDue }: { dueHeadRows: DueHeadRow[]; totalDue: number }) {
  return (
    <section className="glass-card rounded-2xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
        <h3 className="text-base sm:text-lg font-semibold text-white flex items-center gap-2">
          <Receipt className="w-5 h-5 text-lime-400 shrink-0" />
          Fee dues by head
        </h3>
        <span className="text-xs sm:text-sm text-gray-400">
          Total due: <span className="text-white font-semibold">{formatRupee(totalDue)}</span>
        </span>
      </div>

      {dueHeadRows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">No fee heads assigned yet.</p>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {dueHeadRows.map((row) => (
              <DueHeadCard key={row.key} row={row} />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5 text-left text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3 font-medium">Fee head</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Due</th>
                  <th className="px-4 py-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {dueHeadRows.map((row) => (
                  <tr key={row.key} className="bg-white/2 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-gray-200">{row.label}</td>
                    <td className="px-4 py-3 text-right text-white">{formatRupee(row.total)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">{formatRupee(row.paid)}</td>
                    <td className="px-4 py-3 text-right text-white font-medium">
                      {formatRupee(row.due)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block text-xs px-2.5 py-1 rounded-full ${row.status.className}`}
                      >
                        {row.status.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
