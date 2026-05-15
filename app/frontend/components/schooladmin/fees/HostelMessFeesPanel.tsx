"use client";

import { useEffect, useMemo, useState } from "react";
import SelectInput from "../../common/SelectInput";
import PrimaryButton from "../../common/PrimaryButton";
import type { Class, ExtraFee } from "./types";
import { findInstallmentPair, isUnsplitLumpExtraFee } from "@/lib/extraFeeInstallments";

const inputClass =
  "w-full min-h-[44px] rounded-xl border border-white/10 bg-[#0F172A]/50 px-4 py-2.5 text-sm text-gray-200 placeholder:text-white/35 focus:border-lime-400/60 focus:outline-none focus:ring-1 focus:ring-lime-400/30";

const labelClass = "block text-xs font-medium text-gray-400 mb-2";

function scopeLabel(scope: string | null | undefined): string {
  const s = (scope ?? "ALL").toUpperCase();
  if (s === "HOSTELLER") return "Hostel only";
  if (s === "DAY_SCHOLAR") return "Day scholars only";
  return "All students";
}

function normName(name: string) {
  return name.trim().toLowerCase();
}

type CatalogHead = {
  pair: { first: ExtraFee; second: ExtraFee } | null;
  lump: ExtraFee | null;
  single: ExtraFee | null;
};

function resolveCatalogHead(
  fees: ExtraFee[],
  baseName: string,
  match: (e: ExtraFee) => boolean
): CatalogHead {
  const pair = findInstallmentPair(fees, baseName, match);
  if (pair) return { pair, lump: null, single: null };
  const lump =
    fees.find(
      (e) =>
        match(e) &&
        isUnsplitLumpExtraFee({
          name: e.name,
          splitIntoTwoInstallments: Boolean(e.splitIntoTwoInstallments),
        })
    ) ?? null;
  if (lump) return { pair: null, lump, single: null };
  const single =
    fees.find((e) => match(e) && normName(e.name) === normName(baseName)) ?? null;
  return { pair: null, lump: null, single };
}

function combinedAmount(head: CatalogHead): number {
  if (head.pair) return (Number(head.pair.first.amount) || 0) + (Number(head.pair.second.amount) || 0);
  if (head.lump) return Number(head.lump.amount) || 0;
  if (head.single) return Number(head.single.amount) || 0;
  return 0;
}

function patchTargetId(head: CatalogHead): string | null {
  if (head.pair) return head.pair.first.id;
  if (head.lump) return head.lump.id;
  if (head.single) return head.single.id;
  return null;
}

interface HostelMessFeesPanelProps {
  classes: Class[];
  extraFees: ExtraFee[];
  /** School-wide residency-scoped head (from your fee catalog). */
  schoolResidencyHeadName: string;
  /** Per-class head (from your fee catalog). */
  classHeadName: string;
  onSuccess: () => void;
}

export default function HostelMessFeesPanel({
  classes,
  extraFees,
  schoolResidencyHeadName,
  classHeadName,
  onSuccess,
}: HostelMessFeesPanelProps) {
  const schoolHead = useMemo(
    () =>
      resolveCatalogHead(extraFees, schoolResidencyHeadName, (e) => e.targetType === "SCHOOL"),
    [extraFees, schoolResidencyHeadName]
  );

  const [schoolAmount, setSchoolAmount] = useState("");
  const [schoolSaving, setSchoolSaving] = useState(false);

  useEffect(() => {
    const total = combinedAmount(schoolHead);
    setSchoolAmount(total > 0 ? String(total) : "");
  }, [schoolHead]);

  const saveSchoolHead = async () => {
    const amt = Number(schoolAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid amount (₹)");
      return;
    }
    setSchoolSaving(true);
    try {
      const targetId = patchTargetId(schoolHead);
      if (targetId) {
        const res = await fetch(`/api/fees/extra/${targetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            combinedInstallmentTotal: amt,
            splitIntoTwoInstallments: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "Failed to update fee");
          return;
        }
      } else {
        const res = await fetch("/api/fees/extra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: schoolResidencyHeadName,
            amount: amt,
            targetType: "SCHOOL",
            residencyScope: "HOSTELLER",
            splitIntoTwoInstallments: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "Failed to save fee");
          return;
        }
      }
      onSuccess();
    } finally {
      setSchoolSaving(false);
    }
  };

  const [messClassId, setMessClassId] = useState("");
  const [messAmount, setMessAmount] = useState("");
  const [messSaving, setMessSaving] = useState(false);

  const classHead = useMemo(() => {
    if (!messClassId) return null;
    return resolveCatalogHead(
      extraFees,
      classHeadName,
      (e) => e.targetType === "CLASS" && e.targetClassId === messClassId
    );
  }, [extraFees, classHeadName, messClassId]);

  useEffect(() => {
    if (!classHead) {
      setMessAmount("");
      return;
    }
    const total = combinedAmount(classHead);
    setMessAmount(total > 0 ? String(total) : "");
  }, [classHead]);

  const saveClassHead = async () => {
    if (!messClassId) {
      alert("Select a class");
      return;
    }
    const amt = Number(messAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid amount (₹)");
      return;
    }
    setMessSaving(true);
    try {
      const head =
        classHead ??
        resolveCatalogHead(
          extraFees,
          classHeadName,
          (e) => e.targetType === "CLASS" && e.targetClassId === messClassId
        );
      const targetId = patchTargetId(head);
      if (targetId) {
        const res = await fetch(`/api/fees/extra/${targetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            combinedInstallmentTotal: amt,
            splitIntoTwoInstallments: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "Failed to update fee");
          return;
        }
      } else {
        const res = await fetch("/api/fees/extra", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: classHeadName,
            amount: amt,
            targetType: "CLASS",
            targetClassId: messClassId,
            residencyScope: "DAY_SCHOLAR",
            splitIntoTwoInstallments: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "Failed to save fee");
          return;
        }
      }
      onSuccess();
    } finally {
      setMessSaving(false);
    }
  };

  const schoolScopeMismatch =
    schoolHead.lump &&
    schoolHead.lump.residencyScope?.toUpperCase() !== "HOSTELLER" &&
    !schoolHead.pair;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
      <header className="mb-6 border-b border-white/10 pb-5">
        <h3 className="text-lg font-semibold tracking-tight text-white">School & class catalog amounts</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">
          Quick entry for two common catalog heads. When &quot;two installments&quot; is enabled on the template,
          amounts are saved as <span className="font-medium text-white/75">two separate rows</span> (50% + 50%) so each
          installment can be paid and edited independently.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-stretch lg:gap-8">
        <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/20 p-5 sm:p-6">
          <div className="min-h-[4.5rem] border-b border-white/5 pb-4">
            <h4 className="text-base font-semibold text-white">{schoolResidencyHeadName}</h4>
            <p className="mt-1 text-xs leading-snug text-white/50">School-wide · hostellers only</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 pt-5">
            {schoolScopeMismatch && (
              <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
                This head is not limited to hostellers yet ({scopeLabel(schoolHead.lump?.residencyScope)}).
              </p>
            )}
            {schoolHead.pair && (
              <p className="text-xs text-white/45">
                In DB: {schoolHead.pair.first.name} · {schoolHead.pair.second.name}
              </p>
            )}
            <div className="flex-1">
              <label className={labelClass} htmlFor="school-residency-fee-amount">
                Combined amount (₹)
              </label>
              <input
                id="school-residency-fee-amount"
                type="number"
                value={schoolAmount}
                onChange={(e) => setSchoolAmount(e.target.value)}
                className={inputClass}
                placeholder="e.g. 50000"
              />
            </div>
            <div className="mt-auto w-full pt-2">
              <PrimaryButton
                title={schoolSaving ? "Saving…" : patchTargetId(schoolHead) ? "Update" : "Save"}
                loading={schoolSaving}
                onClick={saveSchoolHead}
              />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-black/20 p-5 sm:p-6">
          <div className="min-h-[4.5rem] border-b border-white/5 pb-4">
            <h4 className="text-base font-semibold text-white">{classHeadName}</h4>
            <p className="mt-1 text-xs leading-snug text-white/50">Per class</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 pt-5">
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
            {classHead?.pair && (
              <p className="text-xs text-white/45">
                In DB: {classHead.pair.first.name} · {classHead.pair.second.name}
              </p>
            )}
            <div className="flex-1">
              <label className={labelClass} htmlFor="class-extra-fee-amount">
                Combined amount (₹)
              </label>
              <input
                id="class-extra-fee-amount"
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
                title={messSaving ? "Saving…" : classHead && patchTargetId(classHead) ? "Update" : "Save"}
                loading={messSaving}
                onClick={saveClassHead}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
