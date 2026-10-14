import { Pencil, Trash2 } from "lucide-react";
import { formatRupee } from "@/lib/formatRupee";
import { baseComponentIndexFromHead, type HeadCard } from "./feesBreakdownHelpers";

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
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-300">Global Fee Breakdown Configuration</p>
        {headsLoading ? <p className="text-xs text-gray-500">Loading heads...</p> : null}
      </div>
      {headCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {headCards.map((h) => (
            <div
              key={h.key}
              className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2 min-h-[8.5rem]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-gray-400 uppercase tracking-wide min-w-0 flex-1">{h.label}</p>
                <div className="flex items-center gap-1 shrink-0">
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
                  {!h.extraFeeId && classId && baseComponentIndexFromHead(h) !== null ? (
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
                </div>
              </div>
              <p className="text-lg font-bold text-white">₹{formatRupee(h.amount)}</p>
              <p className="text-xs text-lime-400 mt-auto">
                Paid: ₹{formatRupee(h.paid)}
              </p>
              <p className="text-xs text-red-400">
                Remaining: ₹{formatRupee(h.due)}
              </p>
              {h.due > 0 ? (
                <button
                  type="button"
                  disabled={feesRecordingDisabled}
                  onClick={() => onRecordPayment(h)}
                  className="mt-2 inline-flex items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/15 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Record Payment
                </button>
              ) : (
                <p className="mt-2 text-[11px] font-semibold text-lime-400">Fully paid</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-500">
          No fee head cards available.
        </div>
      )}
    </div>
  );
}
