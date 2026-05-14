"use client";

import { useEffect, useMemo, useState } from "react";
import SelectInput from "../../common/SelectInput";
import PrimaryButton from "../../common/PrimaryButton";
import type { Class, ExtraFee } from "./types";

const HOSTEL_NAME = "Hostel Fee";
const MESS_NAME = "Mess Fee";

const inputClass =
  "w-full min-h-[44px] rounded-xl border border-white/10 bg-[#0F172A]/50 px-4 py-2.5 text-sm text-gray-200 placeholder:text-white/35 focus:border-lime-400/60 focus:outline-none focus:ring-1 focus:ring-lime-400/30";

const labelClass = "block text-xs font-medium text-gray-400 mb-2";

function scopeLabel(scope: string | null | undefined): string {
  const s = (scope ?? "ALL").toUpperCase();
  if (s === "HOSTELLER") return "Hostel only";
  if (s === "DAY_SCHOLAR") return "Day scholars only";
  return "All students";
}

interface HostelMessFeesPanelProps {
  classes: Class[];
  extraFees: ExtraFee[];
  onSuccess: () => void;
}

export default function HostelMessFeesPanel({ classes, extraFees, onSuccess }: HostelMessFeesPanelProps) {
  const existingSchoolHostel = useMemo(
    () =>
      extraFees.find(
        (e) =>
          e.targetType === "SCHOOL" && e.name.trim().toLowerCase() === HOSTEL_NAME.toLowerCase()
      ) ?? null,
    [extraFees]
  );

  const [hostelAmount, setHostelAmount] = useState("");
  const [hostelSaving, setHostelSaving] = useState(false);

  useEffect(() => {
    if (existingSchoolHostel) setHostelAmount(String(existingSchoolHostel.amount));
    else setHostelAmount("");
  }, [existingSchoolHostel?.id, existingSchoolHostel?.amount]);

  const saveHostel = async () => {
    const amt = Number(hostelAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid hostel fee amount (₹)");
      return;
    }
    setHostelSaving(true);
    try {
      if (existingSchoolHostel) {
        const res = await fetch(`/api/fees/extra/${existingSchoolHostel.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt, splitIntoTwoInstallments: true }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "Failed to update hostel fee");
          return;
        }
      } else {
        const res = await fetch("/api/fees/extra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: HOSTEL_NAME,
            amount: amt,
            targetType: "SCHOOL",
            residencyScope: "HOSTELLER",
            splitIntoTwoInstallments: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "Failed to save hostel fee");
          return;
        }
      }
      onSuccess();
    } finally {
      setHostelSaving(false);
    }
  };

  const messForClass = (classId: string) =>
    extraFees.find(
      (e) =>
        e.targetType === "CLASS" &&
        e.targetClassId === classId &&
        e.name.trim().toLowerCase() === MESS_NAME.toLowerCase()
    );

  const [messClassId, setMessClassId] = useState("");
  const [messAmount, setMessAmount] = useState("");
  const [messSaving, setMessSaving] = useState(false);

  const existingMess = messClassId ? messForClass(messClassId) : null;

  useEffect(() => {
    if (existingMess) setMessAmount(String(existingMess.amount));
    else setMessAmount("");
  }, [messClassId, existingMess?.id, existingMess?.amount]);

  const saveMess = async () => {
    if (!messClassId) {
      alert("Select a class for mess fee");
      return;
    }
    const amt = Number(messAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid mess fee amount (₹)");
      return;
    }
    setMessSaving(true);
    try {
      if (existingMess) {
        const res = await fetch(`/api/fees/extra/${existingMess.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: amt, splitIntoTwoInstallments: true }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "Failed to update mess fee");
          return;
        }
      } else {
        const res = await fetch("/api/fees/extra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: MESS_NAME,
            amount: amt,
            targetType: "CLASS",
            targetClassId: messClassId,
            residencyScope: "ALL",
            splitIntoTwoInstallments: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "Failed to save mess fee");
          return;
        }
      }
      onSuccess();
    } finally {
      setMessSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
      <header className="mb-6 border-b border-white/10 pb-5">
        <h3 className="text-lg font-semibold tracking-tight text-white">Hostel and mess fees</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">
          Hostel is one school-wide amount, billed only as a fee head for students marked{" "}
          <span className="font-medium text-white/75">Hostel</span> (residency). Mess is set per class and appears as a head for
          everyone in that class.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-8">
        <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/20 p-5 sm:p-6">
          <div className="min-h-[4.5rem] border-b border-white/5 pb-4">
            <h4 className="text-base font-semibold text-white">School hostel fee</h4>
            <p className="mt-1 text-xs leading-snug text-white/50">Hostel students only · one amount for the whole school</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 pt-5">
            {existingSchoolHostel && existingSchoolHostel.residencyScope?.toUpperCase() !== "HOSTELLER" && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
                This head is not limited to hostellers yet ({scopeLabel(existingSchoolHostel.residencyScope)}). Remove
                it in the catalog and save again here to charge hostellers only.
              </p>
            )}
            <div className="flex-1">
              <label className={labelClass} htmlFor="hostel-fee-amount">
                Amount (₹)
              </label>
              <input
                id="hostel-fee-amount"
                type="number"
                value={hostelAmount}
                onChange={(e) => setHostelAmount(e.target.value)}
                className={inputClass}
                placeholder="e.g. 50000"
              />
            </div>
            <div className="mt-auto w-full pt-2">
              <PrimaryButton
                title={hostelSaving ? "Saving…" : existingSchoolHostel ? "Update hostel fee" : "Save hostel fee"}
                loading={hostelSaving}
                onClick={saveHostel}
              />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/20 p-5 sm:p-6">
          <div className="min-h-[4.5rem] border-b border-white/5 pb-4">
            <h4 className="text-base font-semibold text-white">Mess fee (by class)</h4>
            <p className="mt-1 text-xs leading-snug text-white/50">All students in the selected class</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 pt-5">
            <div>
              <SelectInput
                label="Class"
                value={messClassId}
                onChange={setMessClassId}
                options={[
                  { label: "Select class", value: "" },
                  ...classes.map((c) => ({
                    label: `${c.name}${c.section ? `-${c.section}` : ""}`,
                    value: c.id,
                  })),
                ]}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass} htmlFor="mess-fee-amount">
                Mess amount (₹)
              </label>
              <input
                id="mess-fee-amount"
                type="number"
                value={messAmount}
                onChange={(e) => setMessAmount(e.target.value)}
                className={inputClass}
                placeholder="e.g. 3000"
                disabled={!messClassId}
              />
            </div>
            <div className="mt-auto w-full pt-2">
              <PrimaryButton
                title={messSaving ? "Saving…" : existingMess ? "Update mess fee for class" : "Save mess fee for class"}
                loading={messSaving}
                onClick={saveMess}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
