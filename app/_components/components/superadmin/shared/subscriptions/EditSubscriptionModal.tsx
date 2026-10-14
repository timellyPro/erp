import type { SubscriptionRow } from "../../Subscriptions";

export function EditSubscriptionModal({
  editing,
  setEditing,
  savingId,
  onCancel,
  onSave,
}: {
  editing: SubscriptionRow;
  setEditing: (updater: SubscriptionRow | ((prev: SubscriptionRow | null) => SubscriptionRow | null)) => void;
  savingId: string | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-edit-title"
    >
      <div className="w-full sm:max-w-lg max-h-[min(92dvh,720px)] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-2xl bg-[#020617] border border-white/10 border-b-0 sm:border-b p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3 sticky top-0 bg-[#020617] pt-0 pb-2 -mt-1 z-1">
          <h2 id="subscription-edit-title" className="text-lg font-semibold text-white">
            Edit subscription
          </h2>
          <button
            type="button"
            className="text-white/60 hover:text-white text-sm shrink-0 py-1 px-2 -mr-2"
            onClick={onCancel}
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-white/60 mb-1">School name</p>
            <input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="w-full min-h-11 rounded-xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-400/40"
            />
          </div>

          <div>
            <p className="text-xs text-white/60 mb-1">Subscription mode</p>
            <div className="flex flex-col sm:flex-row rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
              <button
                type="button"
                onClick={() =>
                  setEditing((prev) =>
                    prev ? { ...prev, billingMode: "SCHOOL_PAID" } : prev
                  )
                }
                className={`flex-1 px-3 py-2.5 text-xs rounded-lg font-medium transition ${
                  editing.billingMode === "SCHOOL_PAID"
                    ? "bg-lime-400 text-black"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                School paid
              </button>
              <button
                type="button"
                onClick={() =>
                  setEditing((prev) =>
                    prev ? { ...prev, billingMode: "PARENT_SUBSCRIPTION" } : prev
                  )
                }
                className={`flex-1 px-3 py-2.5 text-xs rounded-lg font-medium transition ${
                  editing.billingMode === "PARENT_SUBSCRIPTION"
                    ? "bg-lime-400 text-black"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                Parent subscription
              </button>
            </div>
          </div>

          {editing.billingMode === "PARENT_SUBSCRIPTION" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-white/60 mb-1">Amount (₹ / year)</p>
                <input
                  type="number"
                  min={0}
                  value={editing.parentSubscriptionAmount ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      parentSubscriptionAmount:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className="w-full min-h-11 rounded-xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-400/40"
                />
              </div>
              <div>
                <p className="text-xs text-white/60 mb-1">Free trial days</p>
                <input
                  type="number"
                  min={0}
                  value={editing.parentSubscriptionTrialDays ?? 0}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      parentSubscriptionTrialDays:
                        e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                  className="w-full min-h-11 rounded-xl bg-black/40 border border-white/15 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-lime-400/40"
                />
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-white/60 mb-1">School status</p>
            <button
              type="button"
              onClick={() =>
                setEditing((prev) =>
                  prev ? { ...prev, isActive: !prev.isActive } : prev
                )
              }
              className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${
                editing.isActive
                  ? "bg-emerald-500/10 border-emerald-400/40 text-emerald-300"
                  : "bg-red-500/10 border-red-400/40 text-red-300"
              }`}
            >
              {editing.isActive ? "Active" : "Deactivated"}
            </button>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-3 sm:py-2 rounded-xl border border-white/15 text-sm text-white/80 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={savingId === editing.id}
            onClick={onSave}
            className="w-full sm:w-auto px-4 py-3 sm:py-2 rounded-xl bg-lime-400 text-black text-sm font-semibold hover:bg-lime-300 disabled:opacity-60"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
