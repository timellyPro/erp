import { useEffect, useState } from "react";
import { Pencil, Trash2, Wallet } from "lucide-react";
import { formatRupee } from "@/lib/formatRupee";
import { baseComponentIndexFromHead, type HeadCard } from "./feesBreakdownHelpers";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Map a head label like "Mess Fee - 2nd Installment" to its configured last-date key. */
function lastDateForHead(label: string, dates: Record<string, string>): string | null {
  const l = label.toLowerCase();
  if (l.includes("previous year")) return dates.previousYear ?? null;
  const base = l.includes("tuition")
    ? "tuition"
    : l.includes("hostel")
      ? "hostel"
      : l.includes("mess")
        ? "mess"
        : l.includes("transport") || /\bbus\b/.test(l)
          ? "bus"
          : null;
  if (!base) return null;
  const term = l.includes("2nd") ? 2 : l.includes("1st") ? 1 : null;
  return (term ? dates[`${base}_t${term}`] : undefined) ?? dates[base] ?? null;
}

export function FeeHeadCardsGrid({
  headCards,
  headsLoading,
  classId,
  deletingExtraId,
  baseHeadBusyKey,
  baseStructureMutating,
  feesRecordingDisabled,
  onEditExtra,
  onDeleteExtra,
  onEditBase,
  onDeleteBase,
  onRecordPayment,
}: {
  headCards: HeadCard[];
  headsLoading: boolean;
  classId?: string | null;
  deletingExtraId: string | null;
  baseHeadBusyKey: string | null;
  baseStructureMutating: boolean;
  feesRecordingDisabled?: boolean;
  onEditExtra: (h: HeadCard) => void;
  onDeleteExtra: (h: HeadCard) => void;
  onEditBase: (h: HeadCard) => void;
  onDeleteBase: (h: HeadCard) => void;
  onRecordPayment: (h: HeadCard) => void;
}) {
  const [lastDates, setLastDates] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/school/settings", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { settings?: { feeLastDates?: Record<string, string> | null } };
        if (!cancelled && data.settings?.feeLastDates) setLastDates(data.settings.feeLastDates);
      } catch {
        // Last dates are optional; show dashes if they cannot be loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-300">Global Fee Breakdown Configuration</p>
        {headsLoading ? <p className="text-xs text-gray-500">Loading heads...</p> : null}
      </div>
      {headCards.length > 0 ? (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-white/70">
              <tr>
                <th className="px-3 py-2 whitespace-nowrap">Fee Type</th>
                <th className="px-2 py-2 whitespace-nowrap text-right">Total</th>
                <th className="px-2 py-2 whitespace-nowrap text-right">Discount</th>
                <th className="px-2 py-2 whitespace-nowrap text-right">Paid</th>
                <th className="px-2 py-2 whitespace-nowrap text-right">Balance</th>
                <th className="px-2 py-2 whitespace-nowrap">Last Date</th>
                <th className="px-2 py-2 whitespace-nowrap text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {headCards.map((h) => {
                const gross = h.gross ?? h.amount;
                const discount = Math.max(gross - h.amount, 0);
                const lastDate = lastDateForHead(h.label, lastDates);
                const canEditBase = !h.extraFeeId && !!classId && baseComponentIndexFromHead(h) !== null;
                return (
                  <tr key={h.key} className="border-t border-white/5">
                    <td className="px-3 py-2 text-white align-middle leading-snug">{h.label}</td>
                    <td className="px-2 py-2 text-white whitespace-nowrap text-right">₹{formatRupee(gross)}</td>
                    <td className="px-2 py-2 text-cyan-300 whitespace-nowrap text-right">₹{formatRupee(discount)}</td>
                    <td className="px-2 py-2 text-lime-300 whitespace-nowrap text-right">₹{formatRupee(h.paid)}</td>
                    <td className="px-2 py-2 text-amber-300 whitespace-nowrap text-right">₹{formatRupee(h.due)}</td>
                    <td className="px-2 py-2 text-gray-300 whitespace-nowrap">{lastDate ? fmtDate(lastDate) : "—"}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        {h.extraFeeId ? (
                          <>
                            <button
                              type="button"
                              title="Edit this fee head (applies to everyone in scope for school/class fees)"
                              disabled={deletingExtraId === h.extraFeeId}
                              onClick={() => onEditExtra(h)}
                              className="p-2 rounded-lg border border-white/15 text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title={
                                h.canDeleteExtra
                                  ? "Remove this student-only extra fee"
                                  : "Remove this fee head (school/class/section — affects all students in scope)"
                              }
                              disabled={deletingExtraId === h.extraFeeId}
                              onClick={() => onDeleteExtra(h)}
                              className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : null}
                        {canEditBase ? (
                          <>
                            <button
                              type="button"
                              title="Edit class fee head (updates the global fee structure for every student in this class)"
                              disabled={baseHeadBusyKey === h.key || baseStructureMutating}
                              onClick={() => onEditBase(h)}
                              className="p-2 rounded-lg border border-white/15 text-gray-300 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              title="Remove class fee head from the class structure (affects every student in this class)"
                              disabled={baseHeadBusyKey === h.key || baseStructureMutating}
                              onClick={() => onDeleteBase(h)}
                              className="p-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/15 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : null}
                        {h.due > 0 ? (
                          <button
                            type="button"
                            title="Record payment"
                            disabled={feesRecordingDisabled}
                            onClick={() => onRecordPayment(h)}
                            className="p-2 rounded-lg border border-blue-500/30 bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Wallet className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-lime-400 px-1">Paid</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-500">
          No fee head cards available.
        </div>
      )}
    </div>
  );
}
