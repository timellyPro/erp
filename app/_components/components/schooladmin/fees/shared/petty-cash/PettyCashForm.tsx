import PrimaryButton from "../../../../common/PrimaryButton";
import { HEAD_OF_ACCOUNT_OPTIONS, type FormState } from "./pettyCashTypes";

export function PettyCashForm({
  form,
  onFormChange,
  saving,
  editingId,
  onSubmit,
  onResetForm,
}: {
  form: FormState;
  onFormChange: (updater: (prev: FormState) => FormState) => void;
  saving: boolean;
  editingId: string | null;
  onSubmit: () => void;
  onResetForm: () => void;
}) {
  return (
    <>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-white/70">Head of Account</label>
          <select
            value={form.headOfAccount}
            onChange={(e) => onFormChange((prev) => ({ ...prev, headOfAccount: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
          >
            <option value="">Select head</option>
            {HEAD_OF_ACCOUNT_OPTIONS.map((head) => (
              <option key={head} value={head}>
                {head}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/70">Amount (INR)</label>
          <input
            type="number"
            value={form.amount}
            onChange={(e) => onFormChange((prev) => ({ ...prev, amount: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
            placeholder="0"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/70">Expense Date</label>
          <input
            type="date"
            value={form.expenseDate}
            onChange={(e) => onFormChange((prev) => ({ ...prev, expenseDate: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/70">Type of Voucher</label>
          <select
            value={form.paymentType}
            onChange={(e) => onFormChange((prev) => ({ ...prev, paymentType: e.target.value as "CASH" | "ONLINE" }))}
            className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
          >
            <option value="CASH">Cash</option>
            <option value="ONLINE">Online</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-white/70">Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => onFormChange((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full min-h-[160px] rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white"
            placeholder="Notes / vendor / purpose"
            maxLength={1000}
            rows={6}
          />
          <p className="mt-1 text-[11px] text-white/45">{form.description.length}/1000</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PrimaryButton
          title={saving ? "Saving..." : editingId ? "Update Expense" : "Add Expense"}
          loading={saving}
          onClick={onSubmit}
        />
        {editingId ? (
          <button
            type="button"
            onClick={onResetForm}
            className="rounded-xl border border-white/20 px-4 py-2"
          >
            Cancel Edit
          </button>
        ) : null}
      </div>
    </>
  );
}
