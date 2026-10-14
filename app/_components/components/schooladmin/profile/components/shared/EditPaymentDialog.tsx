import { X } from "lucide-react";
import { EDIT_GATEWAY_OPTIONS, isSuccessStatus, isSyntheticPaymentId } from "./feeTransactionsHelpers";
import type { PaymentRow } from "./feeTransactionsTypes";

export function EditPaymentDialog({
  editing,
  editAmount,
  onEditAmountChange,
  editRef,
  onEditRefChange,
  editGateway,
  onEditGatewayChange,
  editDate,
  onEditDateChange,
  saving,
  onClose,
  onSave,
}: {
  editing: PaymentRow;
  editAmount: string;
  onEditAmountChange: (v: string) => void;
  editRef: string;
  onEditRefChange: (v: string) => void;
  editGateway: string;
  onEditGatewayChange: (v: string) => void;
  editDate: string;
  onEditDateChange: (v: string) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-payment-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h4 id="edit-payment-title" className="text-lg font-semibold text-white">
            {isSyntheticPaymentId(editing.id) ? `Edit ${editing.feeTypeName || "fee"}` : "Edit transaction"}
          </h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 text-sm">
          {isSyntheticPaymentId(editing.id) ? (
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
              This line is the amount stored on the student profile (not a separate payment
              record). Saving updates the student; use 0 to clear.
            </p>
          ) : null}
          {isSyntheticPaymentId(editing.id) || isSuccessStatus(editing.status) ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-white/50">Amount (₹)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={editAmount}
                onChange={(e) => onEditAmountChange(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
              />
            </div>
          ) : (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
              Amount can only be edited for successful (SUCCESS) payments. You can still update
              reference, method, and date.
            </p>
          )}
          {!isSyntheticPaymentId(editing.id) ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Reference / UTR</label>
                <input
                  type="text"
                  value={editRef}
                  onChange={(e) => onEditRefChange(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                  placeholder="Transaction reference"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">
                  Payment method (fee report column)
                </label>
                <select
                  value={editGateway}
                  onChange={(e) => onEditGatewayChange(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                >
                  {!EDIT_GATEWAY_OPTIONS.some((o) => o.value === editGateway) ? (
                    <option value={editGateway}>
                      Legacy / other: {editGateway || "—"} (choose a standard code below after this option)
                    </option>
                  ) : null}
                  {EDIT_GATEWAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {!EDIT_GATEWAY_OPTIONS.some((o) => o.value === (editing?.method || "").trim()) ? (
                  <p className="mt-1 text-[11px] text-amber-200/90">
                    This row uses a non-standard gateway code. Select{' '}
                    <span className="font-semibold">Online (UPI / QR)</span> or{' '}
                    <span className="font-semibold">UPI</span> for digital collections, then save — the fee Excel
                    report uses this field for the Cash vs Online columns.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-white/50">Date recorded</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => onEditDateChange(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
              </div>
            </>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-xl bg-lime-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
