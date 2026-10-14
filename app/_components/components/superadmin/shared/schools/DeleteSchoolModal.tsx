import type { SchoolRow } from "../../Schools";

export function DeleteSchoolModal({
  modalSchool,
  confirmName,
  setConfirmName,
  deleteBusy,
  deleteError,
  onCancel,
  onConfirm,
}: {
  modalSchool: SchoolRow;
  confirmName: string;
  setConfirmName: (v: string) => void;
  deleteBusy: boolean;
  deleteError: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-school-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/95 p-5 shadow-2xl shadow-black/50">
        <h2 id="delete-school-title" className="text-lg font-semibold text-white">
          Delete school
        </h2>
        <p className="mt-2 text-sm text-white/70 leading-relaxed">
          This removes{" "}
          <span className="font-medium text-white">{modalSchool.name}</span> and related records:
          students, classes, fees, payments, news, homework, exams, admissions, and staff accounts that
          exist only for this school. This cannot be undone.
        </p>
        <label htmlFor="confirm-school-name" className="mt-4 block text-xs font-medium text-white/50">
          Type the school name to confirm
        </label>
        <input
          id="confirm-school-name"
          type="text"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          autoComplete="off"
          className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-red-500/40"
          placeholder={modalSchool.name}
          disabled={deleteBusy}
        />
        {deleteError && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {deleteError}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleteBusy}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/5 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleteBusy || confirmName.trim() !== modalSchool.name.trim()}
            className="rounded-xl border border-red-500/50 bg-red-600/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleteBusy ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
