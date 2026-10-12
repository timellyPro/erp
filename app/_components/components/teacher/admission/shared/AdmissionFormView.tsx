import { Loader2, PlusCircle, Save } from "lucide-react";
import { motion } from "framer-motion";
import InputField from "../../../schooladmin/schooladmincomponents/InputField";
import { Select, SectionTitle } from "./PresentationalBits";
import { BOARDING, GENDERS } from "./constants";
import type { BoardingType, FormState, Gender } from "./types";

export function AdmissionFormView({
  editId,
  onCancelEdit,
  form,
  onFormChange,
  classes,
  classOptions,
  onClassIdChange,
  handleSaveClick,
  submitting,
  message,
  messageTone,
}: {
  editId: string | null;
  onCancelEdit: () => void;
  form: FormState;
  onFormChange: (update: (p: FormState) => FormState) => void;
  classes: { id: string; name: string; section: string | null }[];
  classOptions: { label: string; value: string }[];
  onClassIdChange: (v: string) => void;
  handleSaveClick: () => void;
  submitting: boolean;
  message: string | null;
  messageTone: "success" | "error";
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-6 border border-white/10 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-lime-400" />
            <div className="text-white font-semibold">
              {editId ? "Edit Admission Application" : "Admission Form"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editId && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 font-semibold hover:bg-white/10"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InputField
            label="Timelly No (optional)"
            value={form.fedenaNo}
            onChange={(v) => onFormChange((p) => ({ ...p, fedenaNo: v }))}
          />
          <InputField
            label="PEN Number (optional)"
            value={form.penNumber}
            onChange={(v) => onFormChange((p) => ({ ...p, penNumber: v }))}
          />
          <InputField
            label="APAAR ID (optional)"
            value={form.apaarId}
            onChange={(v) => onFormChange((p) => ({ ...p, apaarId: v }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select
            label="Boarding Type"
            value={form.boardingType}
            onChange={(v) => onFormChange((p) => ({ ...p, boardingType: v as BoardingType }))}
            options={BOARDING}
          />
          <Select
            label="Residency Type"
            value={form.residencyType}
            onChange={(v) => onFormChange((p) => ({ ...p, residencyType: v }))}
            options={[
              { label: "Day Scholar", value: "Day Scholar" },
              { label: "Hostel", value: "Hosteller" },
              { label: "RTE", value: "RTE" },
            ]}
          />
          <Select
            label="Gender"
            value={form.gender}
            onChange={(v) => onFormChange((p) => ({ ...p, gender: v as Gender }))}
            options={GENDERS}
          />
          <Select
            label="Class"
            value={form.classId}
            onChange={onClassIdChange}
            options={
              classOptions.length > 1
                ? classOptions
                : [{ label: classes.length === 0 ? "No classes in school" : "Unassigned", value: "" }]
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InputField
            label="Application Number"
            value={form.applicationNo}
            onChange={(v) => onFormChange((p) => ({ ...p, applicationNo: v }))}
            required
          />
          <InputField
            label="STUDENT NAME"
            value={form.studentName}
            onChange={(v) => onFormChange((p) => ({ ...p, studentName: v }))}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <InputField
            label="Date of Birth"
            type="date"
            value={form.dateOfBirth}
            onChange={(v) => onFormChange((p) => ({ ...p, dateOfBirth: v }))}
            required
          />
          <InputField
            label="ADHAAR ID (optional)"
            value={form.aadharNo}
            onChange={(v) => onFormChange((p) => ({ ...p, aadharNo: v }))}
          />
          <InputField
            label="PAN Number (optional)"
            value={form.panNumber}
            onChange={(v) => onFormChange((p) => ({ ...p, panNumber: v }))}
          />
        </div>

        <p className="text-xs text-white/50 -mt-2 mb-2">
          Tuition for enrolled students comes from the school admin global fee structure for each class, not from this form.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <InputField
            label="Application Fee (optional, record only)"
            value={form.applicationFee}
            onChange={(v) => onFormChange((p) => ({ ...p, applicationFee: v }))}
            placeholder="e.g. 500"
          />
          <InputField
            label="Admission Fee (optional, record only)"
            value={form.admissionFee}
            onChange={(v) => onFormChange((p) => ({ ...p, admissionFee: v }))}
            placeholder="e.g. 5000"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InputField
            label="Nationality"
            value={form.nationality}
            onChange={(v) => onFormChange((p) => ({ ...p, nationality: v }))}
            required
          />
          <InputField
            label="Languages at Home"
            value={form.languagesAtHome}
            onChange={(v) => onFormChange((p) => ({ ...p, languagesAtHome: v }))}
            required
          />
          <InputField
            label="Caste (optional)"
            value={form.caste}
            onChange={(v) => onFormChange((p) => ({ ...p, caste: v }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InputField
            label="Religion (optional)"
            value={form.religion}
            onChange={(v) => onFormChange((p) => ({ ...p, religion: v }))}
          />
        </div>

        <div className="pt-2 border-t border-white/10 space-y-4">
          <SectionTitle title="Address" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Present Address" value={form.presentAddress} onChange={(v) => onFormChange((p) => ({ ...p, presentAddress: v }))} required />
            <InputField label="Permanent Address" value={form.permanentAddress} onChange={(v) => onFormChange((p) => ({ ...p, permanentAddress: v }))} required />
          </div>
        </div>

        <div className="pt-2 border-t border-white/10 space-y-4">
          <SectionTitle title="Parent Details" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InputField label="Parent Name" value={form.parentName} onChange={(v) => onFormChange((p) => ({ ...p, parentName: v }))} required />
            <InputField label="Occupation" value={form.parentOccupation} onChange={(v) => onFormChange((p) => ({ ...p, parentOccupation: v }))} required />
            <InputField label="Office Address" value={form.officeAddress} onChange={(v) => onFormChange((p) => ({ ...p, officeAddress: v }))} required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InputField label="Parent Phone" value={form.parentPhone} onChange={(v) => onFormChange((p) => ({ ...p, parentPhone: v }))} required />
            <InputField label="Parent Email" value={form.parentEmail} onChange={(v) => onFormChange((p) => ({ ...p, parentEmail: v }))} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InputField label="WhatsApp" value={form.parentWhatsapp} onChange={(v) => onFormChange((p) => ({ ...p, parentWhatsapp: v }))} required />
            <InputField label="Aadhar Number (optional)" value={form.bankAccountNo} onChange={(v) => onFormChange((p) => ({ ...p, bankAccountNo: v }))} />
          </div>
        </div>

        <div className="pt-2 border-t border-white/10 space-y-4">
          <SectionTitle title="Mother Details" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <InputField label="Mother Name" value={form.motherName} onChange={(v) => onFormChange((p) => ({ ...p, motherName: v }))} />
            <InputField label="Phone Number" value={form.motherPhone} onChange={(v) => onFormChange((p) => ({ ...p, motherPhone: v }))} />
            <InputField label="Aadhar Number" value={form.motherAadharNo} onChange={(v) => onFormChange((p) => ({ ...p, motherAadharNo: v }))} />
            <InputField label="Email ID" value={form.motherEmail} onChange={(v) => onFormChange((p) => ({ ...p, motherEmail: v }))} />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-lime-400 text-black font-semibold hover:bg-lime-500 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {submitting ? "Saving..." : editId ? "Update" : "Save"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border p-4 ${
            messageTone === "success"
              ? "bg-lime-400/10 border-lime-400/20 text-lime-300"
              : "bg-red-500/10 border-red-500/20 text-red-300"
          }`}
        >
          {message}
        </div>
      )}
    </motion.div>
  );
}
