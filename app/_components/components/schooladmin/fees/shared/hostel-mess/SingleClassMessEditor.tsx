import PrimaryButton from "../../../../common/PrimaryButton";
import type { Class, ExtraFee } from "../../types";
import { classLabel, existingMessAmountForClass } from "./hostelMessFeesUtils";

const inputClass =
  "w-full min-h-[42px] rounded-xl border border-white/10 bg-[#0B1220]/80 px-4 py-2.5 text-sm text-gray-100 placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20";

const labelClass = "block text-[11px] font-semibold uppercase tracking-wide text-white/45 mb-1.5";

export function SingleClassMessEditor({
  classRef,
  extraFees,
  classHeadName,
  draft,
  hasDuplicate,
  tableSaving,
  onDraftChange,
  onSave,
}: {
  classRef: Class;
  extraFees: ExtraFee[];
  classHeadName: string;
  draft: string;
  hasDuplicate: boolean;
  tableSaving: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}) {
  const saved = existingMessAmountForClass(extraFees, classHeadName, classRef.id);
  const draftNum = Number(draft);
  const changed =
    draft.trim() !== "" &&
    Number.isFinite(draftNum) &&
    draftNum > 0 &&
    Math.abs(draftNum - saved) > 0.02;

  let status = "Not set";
  let statusClass = "text-white/40 bg-white/5 border-white/10";
  if (hasDuplicate) {
    status = "Duplicate";
    statusClass = "text-amber-200 bg-amber-500/15 border-amber-500/30";
  } else if (changed) {
    status = "Changed";
    statusClass = "text-sky-200 bg-sky-500/15 border-sky-500/30";
  } else if (saved > 0) {
    status = "Saved";
    statusClass = "text-lime-200 bg-lime-500/10 border-lime-500/25";
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h5 className="text-base font-semibold text-white">{classLabel(classRef)}</h5>
          <p className="mt-0.5 text-xs text-white/45">Day scholars · 2 installments</p>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}
        >
          {status}
        </span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>In database (₹)</label>
          <p className="min-h-[42px] rounded-lg border border-white/10 bg-[#0B1220]/40 px-3 py-2.5 text-right text-sm tabular-nums text-white/70">
            {saved > 0 ? saved.toLocaleString("en-IN") : "—"}
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor={`mess-amt-${classRef.id}`}>
            New total (₹)
          </label>
          <input
            id={`mess-amt-${classRef.id}`}
            type="number"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            className={inputClass}
            placeholder="Enter amount"
            disabled={tableSaving}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <PrimaryButton
          title={tableSaving ? "Saving…" : changed ? "Save this class" : "Save class mess fee"}
          loading={tableSaving}
          onClick={onSave}
        />
      </div>
    </div>
  );
}
