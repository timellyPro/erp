import { createPortal } from "react-dom";
import { X } from "lucide-react";
import SelectInput from "../../../../common/SelectInput";
import { RESIDENCY_OPTIONS } from "./profileSidebarHelpers";

export function EditStudentModal({
  sName,
  onSNameChange,
  sEmail,
  onSEmailChange,
  sPhone,
  onSPhoneChange,
  sAddress,
  onSAddressChange,
  sRoll,
  onSRollChange,
  sClassId,
  onSClassIdChange,
  classOptions,
  sDob,
  onSDobChange,
  sGender,
  onSGenderChange,
  sResidency,
  onSResidencyChange,
  saving,
  onClose,
  onSave,
}: {
  sName: string;
  onSNameChange: (v: string) => void;
  sEmail: string;
  onSEmailChange: (v: string) => void;
  sPhone: string;
  onSPhoneChange: (v: string) => void;
  sAddress: string;
  onSAddressChange: (v: string) => void;
  sRoll: string;
  onSRollChange: (v: string) => void;
  sClassId: string;
  onSClassIdChange: (v: string) => void;
  classOptions: { label: string; value: string }[];
  sDob: string;
  onSDobChange: (v: string) => void;
  sGender: string;
  onSGenderChange: (v: string) => void;
  sResidency: string;
  onSResidencyChange: (v: string) => void;
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
      aria-labelledby="edit-student-sidebar-title"
    >
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h4 id="edit-student-sidebar-title" className="text-lg font-semibold text-white">
            Edit student details
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
        <div className="space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Full name</label>
            <input
              value={sName}
              onChange={(e) => onSNameChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Email (login)</label>
            <input
              type="email"
              value={sEmail}
              onChange={(e) => onSEmailChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Phone</label>
            <input
              value={sPhone}
              onChange={(e) => onSPhoneChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Address</label>
            <textarea
              value={sAddress}
              onChange={(e) => onSAddressChange(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white resize-y min-h-[4rem]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Roll number</label>
            <input
              value={sRoll}
              onChange={(e) => onSRollChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Class</label>
            <SelectInput
              value={sClassId}
              onChange={onSClassIdChange}
              options={classOptions}
              bgColor="black"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Date of birth</label>
            <input
              type="date"
              value={sDob}
              onChange={(e) => onSDobChange(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Gender</label>
            <input
              value={sGender}
              onChange={(e) => onSGenderChange(e.target.value)}
              placeholder="e.g. Male, Female"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/50">Residency</label>
            <SelectInput
              value={sResidency}
              onChange={onSResidencyChange}
              options={[...RESIDENCY_OPTIONS]}
              bgColor="black"
            />
            <p className="mt-1 text-[11px] leading-snug text-white/45">
              Hostel and Day Scholar changes apply to this student only. Fees for the months already spent stay, and a transport kilometre choice opens if they become a day scholar.
            </p>
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
