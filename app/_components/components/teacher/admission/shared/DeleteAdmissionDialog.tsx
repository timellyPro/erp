import { Loader2 } from "lucide-react";
import type { AdmissionRow } from "./types";

export function DeleteAdmissionDialog({
  row,
  deleting,
  onCancel,
  onConfirm,
}: {
  row: AdmissionRow | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!row) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1220] p-5 space-y-4">
        <div className="text-white font-semibold">Delete Admission</div>
        <p className="text-sm text-white/70">
          {`Are you sure you want to delete ${row.applicationNo} (${row.firstName} ${row.lastName})?`}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-xl bg-red-500/80 text-white font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {deleting && <Loader2 size={16} className="animate-spin" />}
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
