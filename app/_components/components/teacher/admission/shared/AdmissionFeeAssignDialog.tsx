import { Loader2 } from "lucide-react";
import { classLabel, displayResidencyType, formatInrCell, sanitizeMoneyInput } from "./utils";
import type { AdmissionRow, FeeAssignRow, FeeHeadOption } from "./types";

export type ExistingStudentExtra = {
  id: string;
  name: string;
  amount: number;
  splitIntoTwoInstallments: boolean;
};

export function AdmissionFeeAssignDialog({
  dialog,
  classBaseFeeTotal,
  existingStudentExtras,
  editingExistingFeeId,
  editingExistingFeeName,
  editingExistingFeeAmount,
  editingExistingFeeSplit,
  onStartEditExisting,
  onCancelEditExisting,
  onEditingNameChange,
  onEditingAmountChange,
  onEditingSplitChange,
  onSaveExisting,
  onDeleteExisting,
  catalogLoading,
  dbFeeHeadOptions,
  onToggleDbFeeHeadOption,
  onAddSelectedDbHeads,
  assignFeeError,
  feeAssignRows,
  onFeeAssignRowChange,
  onRemoveFeeAssignRow,
  onAddFeeAssignRow,
  assigningFees,
  onCancel,
  onSave,
}: {
  dialog: AdmissionRow | null;
  classBaseFeeTotal: number | null;
  existingStudentExtras: ExistingStudentExtra[];
  editingExistingFeeId: string | null;
  editingExistingFeeName: string;
  editingExistingFeeAmount: string;
  editingExistingFeeSplit: boolean;
  onStartEditExisting: (extra: ExistingStudentExtra) => void;
  onCancelEditExisting: () => void;
  onEditingNameChange: (value: string) => void;
  onEditingAmountChange: (value: string) => void;
  onEditingSplitChange: (value: boolean) => void;
  onSaveExisting: () => void;
  onDeleteExisting: (feeId: string) => void;
  catalogLoading: boolean;
  dbFeeHeadOptions: FeeHeadOption[];
  onToggleDbFeeHeadOption: (key: string, selected: boolean) => void;
  onAddSelectedDbHeads: () => void;
  assignFeeError: string | null;
  feeAssignRows: FeeAssignRow[];
  onFeeAssignRowChange: (id: string, patch: Partial<FeeAssignRow>) => void;
  onRemoveFeeAssignRow: (id: string) => void;
  onAddFeeAssignRow: () => void;
  assigningFees: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!dialog) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex max-h-[min(92vh,56rem)] w-full max-w-2xl min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] shadow-xl">
        <div className="shrink-0 space-y-4 border-b border-white/10 p-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-white font-semibold">Assign Fees</div>
              <p className="text-sm text-white/70">
                {`${dialog.firstName} ${dialog.lastName}`} · {classLabel(dialog)} ·{" "}
                {displayResidencyType(dialog.residencyType)}
              </p>
            </div>
            {classBaseFeeTotal !== null && (
              <div className="text-right text-xs text-white/60">
                <div>Class structure (base)</div>
                <div className="text-white/80 font-semibold">{formatInrCell(classBaseFeeTotal)}</div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            Global class fee structure is already applied on enrollment. Use this section for student-level extras
            like transport, hostel, books, etc.
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-5 py-4 [-webkit-overflow-scrolling:touch]">
          {existingStudentExtras.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
              <div className="text-xs font-semibold text-white/80">Already assigned extras</div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {existingStudentExtras.map((ef) => (
                  <div
                    key={ef.id}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 space-y-2"
                  >
                    {editingExistingFeeId === ef.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editingExistingFeeName}
                          onChange={(e) => onEditingNameChange(e.target.value)}
                          className="w-full rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-white"
                          placeholder="Fee name"
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={editingExistingFeeAmount}
                          onChange={(e) => onEditingAmountChange(sanitizeMoneyInput(e.target.value))}
                          className="w-full rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-white"
                          placeholder="Amount"
                        />
                        <label className="flex cursor-pointer items-start gap-2 text-[11px] text-white/70">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-black/40"
                            checked={editingExistingFeeSplit}
                            onChange={(e) => onEditingSplitChange(e.target.checked)}
                          />
                          <span>Two installments (50% + 50%) on fee breakdown</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={onSaveExisting}
                            className="rounded-lg bg-lime-500/20 px-2 py-1 text-[11px] text-lime-200"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={onCancelEditExisting}
                            className="rounded-lg border border-white/20 px-2 py-1 text-[11px] text-white/70"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="text-white/90">{ef.name}</span> · {formatInrCell(ef.amount)}
                          {ef.splitIntoTwoInstallments ? (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase text-sky-300">· 2 inst.</span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onStartEditExisting(ef)}
                            className="rounded-lg border border-white/20 px-2 py-1 text-[11px] text-white/80"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteExisting(ef.id)}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
            <div className="text-xs font-semibold text-white/80">Fee heads catalog</div>
            <p className="text-[11px] text-white/50">
              Custom heads saved under <span className="text-white/70">Fees → Add extra fees</span>, plus school /
              class / section extras from that page. Select and add to this student, or enter custom rows below.
            </p>
            {catalogLoading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-white/60">
                <Loader2 size={16} className="animate-spin text-lime-300" />
                Loading fee heads…
              </div>
            ) : dbFeeHeadOptions.length === 0 ? (
              <p className="text-xs text-white/45 py-1">
                No heads yet. Under <span className="text-white/70">Fees → Add extra fees</span>, add{" "}
                <span className="text-white/70">Custom fee heads</span> or scoped extras (school / class / section),
                then open Assign Fees again.
              </p>
            ) : (
              <>
                <div className="grid max-h-[min(38vh,14rem)] min-h-0 grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1 touch-pan-y [-webkit-overflow-scrolling:touch] md:grid-cols-2">
                  {dbFeeHeadOptions.map((h) => (
                    <label
                      key={h.key}
                      className="flex min-h-0 items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={h.selected}
                        onChange={(e) => onToggleDbFeeHeadOption(h.key, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-white/90">{h.name}</span>
                        <span className="block text-[10px] text-white/45 mt-0.5">
                          {h.scopeLabel}
                          {h.splitIntoTwoInstallments ? " · 2 installments" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-medium">{formatInrCell(h.amount)}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={onAddSelectedDbHeads}
                    className="rounded-xl border border-sky-500/30 bg-sky-500/15 px-3 py-2 text-xs text-sky-200"
                  >
                    Add selected heads
                  </button>
                </div>
              </>
            )}
          </div>

          {assignFeeError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              {assignFeeError}
            </div>
          )}

          <div className="space-y-2">
            {feeAssignRows.map((row) => (
              <div key={row.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_160px_90px]">
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => onFeeAssignRowChange(row.id, { name: e.target.value })}
                  className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
                  placeholder="Fee name (e.g. Transport Fee / Hostel Fee)"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.amount}
                  onChange={(e) => onFeeAssignRowChange(row.id, { amount: sanitizeMoneyInput(e.target.value) })}
                  className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white"
                  placeholder="Amount"
                />
                <button
                  type="button"
                  onClick={() => onRemoveFeeAssignRow(row.id)}
                  className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20"
                >
                  Remove
                </button>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-white/20"
                    checked={Boolean(row.splitIntoTwoInstallments)}
                    onChange={(e) => onFeeAssignRowChange(row.id, { splitIntoTwoInstallments: e.target.checked })}
                  />
                  Two installments (50% + 50%) - separate rows in database
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-white/10 bg-[#0B1220] p-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onAddFeeAssignRow}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            + Add another fee
          </button>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={assigningFees}
              className="rounded-xl bg-white/5 px-4 py-2 border border-white/10 text-white/70"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={assigningFees}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-2 font-semibold text-black disabled:opacity-60"
            >
              {assigningFees && <Loader2 size={16} className="animate-spin" />}
              {assigningFees ? "Assigning..." : "Save Fees"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
