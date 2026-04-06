"use client";

import { Save, X } from "lucide-react";
import InputField from "../schooladmincomponents/InputField";
import SelectInput from "../../common/SelectInput";
import { SelectOption, StudentFormState } from "./types";

type Props = {
  form: StudentFormState;
  classOptions: SelectOption[];
  sectionOptions: SelectOption[];
  saving: boolean;
  studentName: string;
  onFieldChange: (key: keyof StudentFormState, value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function StudentEditPanel({
  form,
  classOptions,
  sectionOptions,
  saving,
  studentName,
  onFieldChange,
  onClose,
  onSave,
}: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1724] p-6 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-lime-300 font-semibold">
          <Save size={18} />
          Editing {studentName}
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-[1.2fr_1.2fr_1fr] gap-4">
        <InputField
          label="Name"
          value={form.name}
          onChange={(value) => onFieldChange("name", value)}
          placeholder="Student Name"
        />
        <InputField
          label="Parent Name"
          value={form.fatherName}
          onChange={(value) => onFieldChange("fatherName", value)}
          placeholder="Parent/Guardian Name"
        />
        <SelectInput
          label="Status"
          value={form.status}
          onChange={(value) => onFieldChange("status", value)}
          options={[
            { label: "Active", value: "Active" },
            { label: "Inactive", value: "Inactive" },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <SelectInput
          label="Residency Type"
          value={form.residencyType}
          onChange={(value) => onFieldChange("residencyType", value)}
          options={[
            { label: "Day Scholar", value: "Day Scholar" },
            { label: "Hosteller", value: "Hosteller" },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <InputField
          label="Application Fee (record only)"
          value={form.applicationFee}
          onChange={(value) => onFieldChange("applicationFee", value)}
          placeholder="Optional"
          type="number"
        />
        <InputField
          label="Admission Fee (record only)"
          value={form.admissionFee}
          onChange={(value) => onFieldChange("admissionFee", value)}
          placeholder="Optional"
          type="number"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_1.4fr] gap-4 items-end">
        <SelectInput
          label="Class"
          value={form.classId}
          onChange={(value) => onFieldChange("classId", value)}
          options={classOptions}
        />
        <SelectInput
          label="Section"
          value={form.section}
          onChange={(value) => onFieldChange("section", value)}
          options={sectionOptions}
        />
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-5 py-3 text-sm font-semibold text-black hover:bg-lime-300 disabled:opacity-60"
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
