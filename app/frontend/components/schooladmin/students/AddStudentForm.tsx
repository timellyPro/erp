"use client";

import { Plus } from "lucide-react";
import InputField from "../schooladmincomponents/InputField";
import SelectInput from "../../common/SelectInput";
import { SelectOption, StudentFormErrors, StudentFormState } from "./types";

type Props = {
  form: StudentFormState;
  errors: StudentFormErrors;
  classOptions: SelectOption[];
  sectionOptions: SelectOption[];
  classesLoading?: boolean;
  ageLabel: string;
  saving: boolean;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  onFieldChange: (key: keyof StudentFormState, value: string) => void;
  onCancel: () => void;
  onReset: () => void;
  onSave: () => void;
};

const renderError = (errors: StudentFormErrors, key: keyof StudentFormState) =>
  errors[key] ? (
    <p className="text-xs text-red-400 mt-1">{errors[key]}</p>
  ) : null;

/** Digits only, capped length (Aadhaar, phone, PIN, etc.). */
const digitsCap =
  (max: number) =>
  (value: string): string =>
    value.replace(/\D/g, "").slice(0, max);

export default function AddStudentForm({
  form,
  errors,
  classOptions,
  sectionOptions,
  classesLoading = false,
  ageLabel,
  saving,
  title = "Add New Student",
  subtitle = "Enter student details below",
  submitLabel = "Save Student",
  onFieldChange,
  onCancel,
  onReset,
  onSave,
}: Props) {
  return (
    <div className="bg-[#0F172A]/50 rounded-2xl p-6 border border-white/10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-100 mb-4">{title}</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        <div>
          <InputField
            label="Full Name*"
            value={form.name}
            onChange={(value) => onFieldChange("name", value)}
            placeholder="Student Name"
            bgColor="white"
          />
          {renderError(errors, "name")}
        </div>
        <div>
          <InputField
            label="Timelly ID"
            value={form.rollNo}
            onChange={(value) => onFieldChange("rollNo", value.slice(0, 40))}
            placeholder="e.g. STU001"
            bgColor="white"
          />
          {renderError(errors, "rollNo")}
        </div>
        <div>
          <InputField
            label="Aadhaar Number*"
            value={form.aadhaarNo}
            onChange={(value) => onFieldChange("aadhaarNo", digitsCap(12)(value))}
            placeholder="12 digits"
            inputMode="numeric"
            autoComplete="off"
            bgColor="white"
          />
          {renderError(errors, "aadhaarNo")}
        </div>
        <div>
          <SelectInput
            label="Gender*"
            value={form.gender}
            onChange={(value) => onFieldChange("gender", value)}
            options={[
              { label: "Select Gender", value: "" },
              { label: "Male", value: "Male" },
              { label: "Female", value: "Female" },
              { label: "Other", value: "Other" },
            ]}
            bgColor="white"
            error={errors.gender}
          />
        </div>
        <div>
          <SelectInput
            label="Residency Type"
            value={form.residencyType}
            onChange={(value) => onFieldChange("residencyType", value)}
            options={[
              { label: "Day Scholar", value: "Day Scholar" },
              { label: "Hosteller", value: "Hosteller" },
            ]}
            bgColor="white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-white/70 mb-1.5">
            Age
          </label>
          <div className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-gray-200">
            {ageLabel}
          </div>
        </div>
        <div>
          <InputField
            label="Date of Birth*"
            value={form.dob}
            onChange={(value) => onFieldChange("dob", value)}
            placeholder="dd-mm-yyyy"
            type="date"
            bgColor="white"
          />
          {renderError(errors, "dob")}
        </div>
        <div>
          <SelectInput
            label="Class*"
            value={form.classId}
            onChange={(value) => onFieldChange("classId", value)}
            options={classOptions}
            disabled={classesLoading || classOptions.length <= 1}
            bgColor="white"
            error={errors.classId}
          />
        </div>
        <div>
          <SelectInput
            label="Section"
            value={form.section}
            onChange={(value) => onFieldChange("section", value)}
            options={sectionOptions}
            disabled={classesLoading || sectionOptions.length <= 1}
            bgColor="white"
          />
        </div>
        <div>
          <SelectInput
            label="Status"
            value={form.status}
            onChange={(value) => onFieldChange("status", value)}
            options={[
              { label: "Active", value: "Active" },
              { label: "Inactive", value: "Inactive" },
            ]}
            bgColor="white"
          />
        </div>
        <div>
          <InputField
            label="Tuition Fee Amount*"
            value={form.totalFee}
            onChange={(value) => onFieldChange("totalFee", value)}
            placeholder="e.g. 12000"
            type="number"
            bgColor="white"
          />
          {renderError(errors, "totalFee")}
        </div>
        <div>
          <InputField
            label="Discount Amount (₹)"
            value={form.discountPercent}
            onChange={(value) => onFieldChange("discountPercent", value)}
            placeholder="e.g. 1200"
            type="number"
            bgColor="white"
          />
          {renderError(errors, "discountPercent")}
        </div>
        <div>
          <InputField
            label="Application Fee (record only)"
            value={form.applicationFee}
            onChange={(value) => onFieldChange("applicationFee", value)}
            placeholder="e.g. 500"
            type="number"
            bgColor="white"
          />
        </div>
        <div>
          <InputField
            label="Admission Fee (record only)"
            value={form.admissionFee}
            onChange={(value) => onFieldChange("admissionFee", value)}
            placeholder="e.g. 5000"
            type="number"
            bgColor="white"
          />
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-white/80 mb-3">
          Parent Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <InputField
              label="Parent Name*"
              value={form.fatherName}
              onChange={(value) => onFieldChange("fatherName", value)}
              placeholder="Parent/Guardian Name"
              bgColor="white"
            />
            {renderError(errors, "fatherName")}
          </div>
          <div>
            <InputField
              label="Mother Name"
              value={form.motherName}
              onChange={(value) => onFieldChange("motherName", value)}
              placeholder="Mother Name"
              bgColor="white"
            />
          </div>
          <div>
            <InputField
              label="Occupation"
              value={form.occupation}
              onChange={(value) => onFieldChange("occupation", value)}
              placeholder="e.g. Business"
              bgColor="white"
            />
          </div>
          <div className="md:col-span-2">
            <InputField
              label="Office Address"
              value={form.officeAddress}
              onChange={(value) => onFieldChange("officeAddress", value)}
              placeholder="Office address"
              bgColor="white"
            />
          </div>
          <div>
            <InputField
              label="Contact Number*"
              value={form.phoneNo}
              onChange={(value) => onFieldChange("phoneNo", digitsCap(10)(value))}
              placeholder="10 digits"
              inputMode="numeric"
              autoComplete="tel"
              bgColor="white"
            />
            {renderError(errors, "phoneNo")}
          </div>
          <div className="md:col-span-2">
            <InputField
              label="Parent / guardian email (optional)"
              value={form.email}
              onChange={(value) => onFieldChange("email", value)}
              placeholder="parent@example.com"
              type="email"
              autoComplete="email"
              bgColor="white"
            />
            <p className="mt-1.5 text-[11px] text-white/50 leading-snug">
              Used for parent contact on the admission record only. The student&apos;s login email is created automatically as their name @ your school domain.
            </p>
            {renderError(errors, "email")}
          </div>
          <div>
            <InputField
              label="Parent WhatsApp"
              value={form.parentWhatsapp}
              onChange={(value) => onFieldChange("parentWhatsapp", digitsCap(10)(value))}
              placeholder="10 digits"
              inputMode="numeric"
              bgColor="white"
            />
            {renderError(errors, "parentWhatsapp")}
          </div>
          <div>
            <InputField
              label="Bank Account No"
              value={form.bankAccountNo}
              onChange={(value) => onFieldChange("bankAccountNo", digitsCap(18)(value))}
              placeholder="9–18 digits"
              inputMode="numeric"
              bgColor="white"
            />
            {renderError(errors, "bankAccountNo")}
          </div>
          <div className="md:col-span-2">
            <InputField
              label="Address"
              value={form.address}
              onChange={(value) => onFieldChange("address", value)}
              placeholder="Full address"
              bgColor="white"
            />
            {renderError(errors, "address")}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-white/80 mb-3">Admission Details (optional)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <InputField label="House No" value={form.houseNo} onChange={(v) => onFieldChange("houseNo", v)} bgColor="white" />
          <InputField label="Street" value={form.street} onChange={(v) => onFieldChange("street", v)} bgColor="white" />
          <InputField label="City" value={form.city} onChange={(v) => onFieldChange("city", v)} bgColor="white" />
          <InputField label="Town" value={form.town} onChange={(v) => onFieldChange("town", v)} bgColor="white" />
          <InputField label="State" value={form.state} onChange={(v) => onFieldChange("state", v)} bgColor="white" />
          <InputField label="Pin Code" value={form.pinCode} onChange={(v) => onFieldChange("pinCode", v)} bgColor="white" />
          <InputField label="Nationality" value={form.nationality} onChange={(v) => onFieldChange("nationality", v)} bgColor="white" />
          <InputField label="Languages at Home" value={form.languagesAtHome} onChange={(v) => onFieldChange("languagesAtHome", v)} bgColor="white" />
          <InputField label="Caste" value={form.caste} onChange={(v) => onFieldChange("caste", v)} bgColor="white" />
          <InputField label="Religion" value={form.religion} onChange={(v) => onFieldChange("religion", v)} bgColor="white" />
          <InputField label="Emergency Father No" value={form.emergencyFatherNo} onChange={(v) => onFieldChange("emergencyFatherNo", v)} bgColor="white" />
          <InputField label="Emergency Mother No" value={form.emergencyMotherNo} onChange={(v) => onFieldChange("emergencyMotherNo", v)} bgColor="white" />
          <InputField label="Emergency Guardian No" value={form.emergencyGuardianNo} onChange={(v) => onFieldChange("emergencyGuardianNo", v)} bgColor="white" />
        </div>
      </div>


      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={onReset}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-lime-400
           px-5 py-2 text-sm font-semibold text-black hover:bg-lime-300 disabled:opacity-60"
        >
          <Plus size={16} /> {saving ? "Saving..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
