"use client";

import { useState } from "react";
import SelectInput from "../../common/SelectInput";
import PrimaryButton from "../../common/PrimaryButton";
import SecondaryButton from "../../common/SecondaryButton";
import type { Class, Student } from "./types";

const inputClass =
  "w-full min-h-[44px] rounded-xl border border-white/10 bg-[#0F172A]/50 px-4 py-2.5 text-sm text-gray-200 placeholder:text-white/35 focus:border-lime-400/60 focus:outline-none focus:ring-1 focus:ring-lime-400/30";

const labelClass = "block text-xs font-medium text-gray-400 mb-2";

interface AddExtraFeeFormProps {
  classes: Class[];
  students: Student[];
  onSuccess: () => void;
}

export default function AddExtraFeeForm({ classes, students, onSuccess }: AddExtraFeeFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [targetType, setTargetType] = useState<"SCHOOL" | "CLASS" | "SECTION" | "STUDENT">("SCHOOL");
  const [residencyScope, setResidencyScope] = useState<"ALL" | "HOSTELLER" | "DAY_SCHOLAR">("ALL");
  const [classId, setClassId] = useState("");
  const [section, setSection] = useState("");
  const [studentId, setStudentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [splitIntoTwoInstallments, setSplitIntoTwoInstallments] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !amount || Number(amount) <= 0) {
      alert("Name and amount required");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        amount: Number(amount),
        targetType,
        residencyScope,
        splitIntoTwoInstallments,
      };
      if (targetType === "CLASS") body.targetClassId = classId || undefined;
      if (targetType === "SECTION") {
        body.targetClassId = classId;
        body.targetSection = section;
      }
      if (targetType === "STUDENT") body.targetStudentId = studentId || undefined;

      const res = await fetch("/api/fees/extra", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || "Failed to add extra fee");
        return;
      }
      setShowForm(false);
      setName("");
      setAmount("");
      setClassId("");
      setSection("");
      setStudentId("");
      setResidencyScope("ALL");
      setSplitIntoTwoInstallments(false);
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  const sections = Array.from(new Set(classes.map((c) => c.section).filter(Boolean))) as string[];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
      <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-white">Other extra fees</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/55">
            Add uniform, bus, library, or custom heads. Use residency to limit who is charged.
          </p>
        </div>
        {!showForm && (
          <div className="shrink-0 sm:pb-0">
            <SecondaryButton title="Add extra fee" onClick={() => setShowForm(true)} />
          </div>
        )}
      </div>

      {!showForm ? null : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            <div>
              <label className={labelClass} htmlFor="extra-fee-name">
                Fee name
              </label>
              <input
                id="extra-fee-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="e.g. Uniform Fee, Bus Fee"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="extra-fee-amount">
                Amount (₹)
              </label>
              <input
                id="extra-fee-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, "");
                  const dot = v.indexOf(".");
                  if (dot === -1) {
                    setAmount(v);
                    return;
                  }
                  const intPart = v.slice(0, dot).replace(/\D/g, "");
                  const frac = v.slice(dot + 1).replace(/\D/g, "").slice(0, 2);
                  setAmount(frac.length > 0 ? `${intPart}.${frac}` : `${intPart}.`);
                }}
                className={inputClass}
                placeholder="0"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-xs text-white/80">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-black/40 text-lime-500 focus:ring-lime-500/40"
              checked={splitIntoTwoInstallments}
              onChange={(e) => setSplitIntoTwoInstallments(e.target.checked)}
            />
            <span>
              <span className="font-medium text-white/90">Two installments (50% + 50%)</span>
              <span className="mt-0.5 block text-[11px] text-white/45">
                Student fee breakdown shows 1st and 2nd installment cards for this head.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            <SelectInput
              label="Apply to"
              value={targetType}
              onChange={(v) => setTargetType(v as "SCHOOL" | "CLASS" | "SECTION" | "STUDENT")}
              options={[
                { label: "Entire school", value: "SCHOOL" },
                { label: "Particular class", value: "CLASS" },
                { label: "Section", value: "SECTION" },
                { label: "Particular student", value: "STUDENT" },
              ]}
            />
            <SelectInput
              label="Residency"
              value={residencyScope}
              onChange={(v) => setResidencyScope(v as "ALL" | "HOSTELLER" | "DAY_SCHOLAR")}
              options={[
                { label: "All students", value: "ALL" },
                { label: "Hostel only", value: "HOSTELLER" },
                { label: "Day scholars only", value: "DAY_SCHOLAR" },
              ]}
            />
          </div>

          {targetType === "CLASS" && (
            <SelectInput
              label="Class"
              value={classId}
              onChange={setClassId}
              options={[
                { label: "Select class", value: "" },
                ...classes.map((c) => ({
                  label: `${c.name}${c.section ? `-${c.section}` : ""}`,
                  value: c.id,
                })),
              ]}
            />
          )}
          {targetType === "SECTION" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
              <SelectInput
                label="Class"
                value={classId}
                onChange={setClassId}
                options={[
                  { label: "Select class", value: "" },
                  ...classes.map((c) => ({
                    label: `${c.name}${c.section ? `-${c.section}` : ""}`,
                    value: c.id,
                  })),
                ]}
              />
              <SelectInput
                label="Section"
                value={section}
                onChange={setSection}
                options={[
                  { label: "Select section", value: "" },
                  ...sections.map((s) => ({ label: s, value: s })),
                ]}
              />
            </div>
          )}
          {targetType === "STUDENT" && (
            <SelectInput
              label="Student"
              value={studentId}
              onChange={setStudentId}
              options={[
                { label: "Select student", value: "" },
                ...students.map((s) => ({
                  label: `${s.user.name || s.admissionNumber}`,
                  value: s.id,
                })),
              ]}
            />
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="min-h-[44px] w-full rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/5 sm:w-auto sm:min-w-[7.5rem]"
            >
              Cancel
            </button>
            <div className="w-full sm:max-w-xs sm:flex-1">
              <PrimaryButton title={saving ? "Adding…" : "Add fee"} loading={saving} onClick={handleSubmit} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
