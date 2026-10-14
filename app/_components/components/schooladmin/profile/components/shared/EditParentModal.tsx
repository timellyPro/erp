import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function EditParentModal({
  pFatherName,
  onPFatherNameChange,
  pFatherPhone,
  onPFatherPhoneChange,
  pMotherName,
  onPMotherNameChange,
  pMotherPhone,
  onPMotherPhoneChange,
  saving,
  onClose,
  onSave,
}: {
  pFatherName: string;
  onPFatherNameChange: (v: string) => void;
  pFatherPhone: string;
  onPFatherPhoneChange: (v: string) => void;
  pMotherName: string;
  onPMotherNameChange: (v: string) => void;
  pMotherPhone: string;
  onPMotherPhoneChange: (v: string) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-parent-sidebar-title"
    >
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h4 id="edit-parent-sidebar-title" className="text-lg font-semibold text-white">
            Edit parent details
          </h4>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
          Update only parent names and mobile numbers here.
        </p>
        <div className="space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Father / guardian name</label>
            <input
              value={pFatherName}
              onChange={(e) => onPFatherNameChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Guardian phone</label>
            <input
              value={pFatherPhone}
              onChange={(e) => onPFatherPhoneChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Mother name</label>
            <input
              value={pMotherName}
              onChange={(e) => onPMotherNameChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Mother phone</label>
            <input
              value={pMotherPhone}
              onChange={(e) => onPMotherPhoneChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => !saving && onClose()}
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
    </div>,
    document.body
  );
}
