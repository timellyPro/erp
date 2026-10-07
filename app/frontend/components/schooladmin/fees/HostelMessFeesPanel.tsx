"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import PrimaryButton from "../../common/PrimaryButton";
import type { Class, ExtraFee } from "./types";
import { findInstallmentPair, isUnsplitLumpExtraFee } from "@/lib/extraFeeInstallments";
import {
  countMessDuplicateExtraFeeIds,
  findMessFeeDuplicateIssues,
  type MessDuplicateIssue,
} from "@/lib/findMessFeeDuplicateIssues";

const inputClass =
  "w-full min-h-[42px] rounded-xl border border-white/10 bg-[#0B1220]/80 px-4 py-2.5 text-sm text-gray-100 placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none focus:ring-2 focus:ring-sky-400/20";

const inputCompact =
  "w-full min-h-[42px] rounded-lg border border-white/10 bg-[#0B1220]/60 px-3 py-2 text-sm text-right tabular-nums text-gray-100 placeholder:text-white/30 focus:border-sky-400/50 focus:outline-none focus:ring-1 focus:ring-sky-400/25";

const labelClass = "block text-[11px] font-semibold uppercase tracking-wide text-white/45 mb-1.5";

function scopeLabel(scope: string | null | undefined): string {
  const s = (scope ?? "ALL").toUpperCase();
  if (s === "HOSTELLER") return "Hostel only";
  if (s === "DAY_SCHOLAR") return "Day scholars only";
  return "All students";
}

function normName(name: string) {
  return name.trim().toLowerCase();
}

function classLabel(c: Class) {
  return `${c.name}${c.section ? ` ${c.section}` : ""}`;
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

function existingMessAmountForClass(
  extraFees: ExtraFee[],
  classHeadName: string,
  classId: string
): number {
  const head = resolveCatalogHead(
    extraFees,
    classHeadName,
    (e) => e.targetType === "CLASS" && e.targetClassId === classId
  );
  return combinedAmount(head);
}

interface HostelMessFeesPanelProps {
  classes: Class[];
  extraFees: ExtraFee[];
  schoolResidencyHeadName: string;
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
  const sortedClasses = useMemo(
    () =>
      [...classes].sort((a, b) =>
        classLabel(a).localeCompare(classLabel(b), undefined, { numeric: true })
      ),
    [classes]
  );

  const duplicateIssues = useMemo(
    () =>
      findMessFeeDuplicateIssues(
        extraFees.map((e) => ({ ...e, residencyScope: e.residencyScope ?? null })),
        sortedClasses
      ),
    [extraFees, sortedClasses]
  );
  const duplicateRowCount = useMemo(
    () => countMessDuplicateExtraFeeIds(duplicateIssues),
    [duplicateIssues]
  );

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
      const body = {
        combinedInstallmentTotal: amt,
        splitIntoTwoInstallments: true,
      };
      const res = targetId
        ? await fetch(`/api/fees/extra/${targetId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/fees/extra", {
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
        alert(data.message || "Failed to save hostel fee");
        return;
      }
      onSuccess();
    } finally {
      setSchoolSaving(false);
    }
  };

  const buildAmountsFromDb = useCallback(() => {
    const next: Record<string, string> = {};
    for (const c of sortedClasses) {
      const total = existingMessAmountForClass(extraFees, classHeadName, c.id);
      next[c.id] = total > 0 ? String(total) : "";
    }
    return next;
  }, [sortedClasses, extraFees, classHeadName]);

  const [classAmounts, setClassAmounts] = useState<Record<string, string>>({});
  const [fillAllValue, setFillAllValue] = useState("");
  const [classSearch, setClassSearch] = useState("");
  const [tableSaving, setTableSaving] = useState(false);
  const [tableProgress, setTableProgress] = useState<string | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [showDuplicateList, setShowDuplicateList] = useState(false);
  /** closed = hidden; "all" = full table; otherwise class id */
  const [classView, setClassView] = useState<"closed" | "all" | string>("closed");

  useEffect(() => {
    setClassAmounts(buildAmountsFromDb());
  }, [buildAmountsFromDb]);

  const applyClassHeadForClass = async (
    classId: string,
    amt: number
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    const head = resolveCatalogHead(
      extraFees,
      classHeadName,
      (e) => e.targetType === "CLASS" && e.targetClassId === classId
    );
    const targetId = patchTargetId(head);
    const patchBody = {
      combinedInstallmentTotal: amt,
      splitIntoTwoInstallments: true,
    };
    if (targetId) {
      const res = await fetch(`/api/fees/extra/${targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: data.message || "Failed to update fee" };
      return { ok: true };
    }
    const res = await fetch("/api/fees/extra", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: classHeadName,
        amount: amt,
        targetType: "CLASS",
        targetClassId: classId,
        residencyScope: "DAY_SCHOLAR",
        splitIntoTwoInstallments: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.message || "Failed to save fee" };
    return { ok: true };
  };

  const applyFillAllToTable = () => {
    const amt = Number(fillAllValue);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid amount to fill all rows");
      return;
    }
    const v = String(amt);
    setClassAmounts((prev) => {
      const next = { ...prev };
      for (const c of sortedClasses) next[c.id] = v;
      return next;
    });
  };

  const runDuplicateCleanup = async () => {
    if (
      !confirm(
        "Remove duplicate mess fees from the database and recalculate all student fee totals? This cannot be undone."
      )
    ) {
      return;
    }
    setCleanupBusy(true);
    try {
      const res = await fetch("/api/fees/extra/cleanup-duplicates", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || "Cleanup failed");
        return;
      }
      const removed = Number(data.removedDuplicateRows ?? 0);
      const remaining = Number(data.remainingDuplicateCount ?? 0);
      alert(
        removed > 0
          ? `Removed ${removed} duplicate row(s). Recalculated ${data.studentsRecalculated ?? 0} students.${
              remaining > 0 ? ` ${remaining} issue(s) may still need review.` : ""
            }`
          : data.message || "No duplicates found. Student totals were refreshed."
      );
      onSuccess();
    } finally {
      setCleanupBusy(false);
    }
  };

  const saveAllClassAmounts = async () => {
    const toSave = sortedClasses
      .map((c) => {
        const raw = classAmounts[c.id]?.trim() ?? "";
        const amt = raw === "" ? NaN : Number(raw);
        const existing = existingMessAmountForClass(extraFees, classHeadName, c.id);
        return { c, amt, existing };
      })
      .filter(
        (row) =>
          Number.isFinite(row.amt) && row.amt > 0 && Math.abs(row.amt - row.existing) > 0.02
      );

    if (toSave.length === 0) {
      alert("Change at least one class amount, then save.");
      return;
    }
    if (
      !confirm(
        `Save ${classHeadName} for ${toSave.length} class(es)? Each total is split into two 50% installments (day scholars).`
      )
    ) {
      return;
    }

    setTableSaving(true);
    let ok = 0;
    const failures: string[] = [];
    try {
      for (let i = 0; i < toSave.length; i++) {
        const { c, amt } = toSave[i]!;
        setTableProgress(`${i + 1} / ${toSave.length}: ${classLabel(c)}`);
        const result = await applyClassHeadForClass(c.id, amt);
        if (result.ok) ok += 1;
        else failures.push(`${classLabel(c)}: ${result.message}`);
      }
      if (failures.length === 0) {
        alert(`Mess fee saved for ${ok} class(es).`);
        onSuccess();
      } else {
        alert(`Saved ${ok}, failed ${failures.length}.\n\n${failures.slice(0, 6).join("\n")}`);
        if (ok > 0) onSuccess();
      }
    } finally {
      setTableSaving(false);
      setTableProgress(null);
    }
  };

  const filteredClasses = useMemo(() => {
    const q = classSearch.trim().toLowerCase();
    if (!q) return sortedClasses;
    return sortedClasses.filter((c) => classLabel(c).toLowerCase().includes(q));
  }, [sortedClasses, classSearch]);

  const configuredCount = sortedClasses.filter((c) => {
    const amt = Number(classAmounts[c.id]);
    return Number.isFinite(amt) && amt > 0;
  }).length;

  const pendingChangeCount = sortedClasses.filter((c) => {
    const raw = classAmounts[c.id]?.trim() ?? "";
    const amt = raw === "" ? NaN : Number(raw);
    const existing = existingMessAmountForClass(extraFees, classHeadName, c.id);
    return Number.isFinite(amt) && amt > 0 && Math.abs(amt - existing) > 0.02;
  }).length;

  const classesWithDuplicate = useMemo(() => {
    const ids = new Set<string>();
    for (const issue of duplicateIssues) {
      if (issue.classId) ids.add(issue.classId);
    }
    return ids;
  }, [duplicateIssues]);

  const schoolScopeMismatch =
    schoolHead.lump &&
    schoolHead.lump.residencyScope?.toUpperCase() !== "HOSTELLER" &&
    !schoolHead.pair;

  const selectedClass =
    classView !== "closed" && classView !== "all"
      ? sortedClasses.find((c) => c.id === classView) ?? null
      : null;

  const saveSingleClass = async () => {
    if (!selectedClass) return;
    const raw = classAmounts[selectedClass.id]?.trim() ?? "";
    const amt = raw === "" ? NaN : Number(raw);
    const existing = existingMessAmountForClass(extraFees, classHeadName, selectedClass.id);
    if (!Number.isFinite(amt) || amt <= 0) {
      alert("Enter a valid amount (₹)");
      return;
    }
    if (Math.abs(amt - existing) <= 0.02) {
      alert("Amount matches what is already saved.");
      return;
    }
    setTableSaving(true);
    setTableProgress(classLabel(selectedClass));
    try {
      const result = await applyClassHeadForClass(selectedClass.id, amt);
      if (result.ok) {
        alert(`Mess fee saved for ${classLabel(selectedClass)}.`);
        onSuccess();
      } else {
        alert(result.message);
      }
    } finally {
      setTableSaving(false);
      setTableProgress(null);
    }
  };

  const classViewSelectValue =
    classView === "closed" ? "" : classView === "all" ? "all" : classView;

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent p-5 sm:p-6">
        <h3 className="text-lg font-semibold tracking-tight text-white">School & class fee catalog</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/55">
          Set hostel fee once for the whole school. Use the mess fee dropdown to edit one class or open
          the full table for all classes.
        </p>
      </header>

      <div className="max-w-md rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-5">
        <h4 className="text-sm font-semibold text-amber-100">{schoolResidencyHeadName}</h4>
        <p className="mt-0.5 text-xs text-white/50">School-wide · hostellers only</p>
        {schoolScopeMismatch && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-black/20 px-3 py-2 text-xs text-amber-100">
            Not limited to hostellers yet ({scopeLabel(schoolHead.lump?.residencyScope)}).
          </p>
        )}
        <div className="mt-4">
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
        <div className="mt-4">
          <PrimaryButton
            title={schoolSaving ? "Saving…" : patchTargetId(schoolHead) ? "Update hostel fee" : "Save hostel fee"}
            loading={schoolSaving}
            onClick={saveSchoolHead}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.08] to-[#0B1220]/40 shadow-lg shadow-black/20">
        <div className="border-b border-white/10 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h4 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Sparkles className="h-5 w-5 text-sky-400" />
                {classHeadName} — all classes
              </h4>
              <p className="mt-1 text-sm text-white/55">
                Day scholars · combined total → 2 installments per class
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatPill label="Classes" value={String(sortedClasses.length)} />
              <StatPill label="Configured" value={`${configuredCount}`} tone="sky" />
              <StatPill
                label="To save"
                value={String(pendingChangeCount)}
                tone={pendingChangeCount > 0 ? "lime" : undefined}
              />
              <StatPill
                label="Duplicates"
                value={String(duplicateRowCount)}
                tone={duplicateRowCount > 0 ? "amber" : "ok"}
              />
            </div>
          </div>

          {duplicateRowCount > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-sm font-semibold text-amber-100">
                      {duplicateRowCount} duplicate mess fee row(s) found
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                      Old bulk student mess fees or extra copies can inflate totals. Remove them from
                      the database (not hidden in UI only).
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowDuplicateList((v) => !v)}
                      className="mt-2 text-xs font-semibold text-amber-200 underline-offset-2 hover:underline"
                    >
                      {showDuplicateList ? "Hide details" : "Show details"}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={runDuplicateCleanup}
                  disabled={cleanupBusy || tableSaving}
                  className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/20 px-4 text-sm font-semibold text-amber-50 hover:bg-amber-500/30 disabled:opacity-50"
                >
                  {cleanupBusy ? (
                    "Removing…"
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Remove duplicates
                    </>
                  )}
                </button>
              </div>
              {showDuplicateList && (
                <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto border-t border-amber-500/20 pt-3">
                  {duplicateIssues.map((issue: MessDuplicateIssue) => (
                    <li
                      key={issue.id}
                      className="rounded-lg bg-black/25 px-3 py-2 text-xs text-amber-100/90"
                    >
                      <span className="font-semibold text-amber-200">{issue.classLabel}</span>
                      <span className="text-amber-100/70"> — {issue.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {duplicateRowCount === 0 && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-lime-500/25 bg-lime-500/10 px-4 py-2.5 text-xs text-lime-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              No duplicate mess fees detected for this school.
            </div>
          )}

          <div className="mt-5 max-w-md">
            <label className={labelClass} htmlFor="mess-class-view">
              View classes
            </label>
            <div className="relative">
              <select
                id="mess-class-view"
                value={classViewSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setClassView(v === "" ? "closed" : v);
                  if (v !== "all") setClassSearch("");
                }}
                disabled={tableSaving || sortedClasses.length === 0}
                className={`${inputClass} appearance-none pr-10 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <option value="">— Hidden —</option>
                <option value="all">All classes (table)</option>
                {sortedClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {classLabel(c)}
                    {classesWithDuplicate.has(c.id) ? " · duplicate" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            </div>
            <p className="mt-1.5 text-xs text-white/40">
              {classView === "closed"
                ? "Class list is hidden. Pick a class or open the full table."
                : classView === "all"
                  ? "Editing all classes in the table below."
                  : `Editing ${selectedClass ? classLabel(selectedClass) : "class"}.`}
            </p>
          </div>
        </div>

        {classView !== "closed" && (
        <div className="space-y-4 border-t border-white/10 px-5 py-4 sm:px-6">
          {classView === "all" && (
          <>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="relative">
              <label className={labelClass} htmlFor="class-search">
                Search class
              </label>
              <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-white/35" />
              <input
                id="class-search"
                type="search"
                value={classSearch}
                onChange={(e) => setClassSearch(e.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="Filter by class name…"
                disabled={tableSaving}
              />
            </div>
            <div className="sm:min-w-[140px]">
              <label className={labelClass} htmlFor="fill-all-mess">
                Fill all rows (₹)
              </label>
              <input
                id="fill-all-mess"
                type="number"
                value={fillAllValue}
                onChange={(e) => setFillAllValue(e.target.value)}
                className={inputClass}
                placeholder="28600"
                disabled={tableSaving}
              />
            </div>
            <button
              type="button"
              onClick={applyFillAllToTable}
              disabled={tableSaving || sortedClasses.length === 0}
              className="min-h-[42px] rounded-xl border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50"
            >
              Apply to all
            </button>
          </div>

          {sortedClasses.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">No classes found.</p>
          ) : filteredClasses.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/50">No classes match your search.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="max-h-[min(32rem,55vh)] overflow-auto">
                <table className="w-full min-w-[36rem] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-[#0a1020] text-[11px] uppercase tracking-wider text-white/45">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">#</th>
                      <th className="px-4 py-3 text-left font-semibold">Class</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">In DB (₹)</th>
                      <th className="px-4 py-3 text-right font-semibold min-w-[9rem]">New total (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClasses.map((c, idx) => {
                      const saved = existingMessAmountForClass(extraFees, classHeadName, c.id);
                      const draft = classAmounts[c.id] ?? "";
                      const draftNum = Number(draft);
                      const changed =
                        draft.trim() !== "" &&
                        Number.isFinite(draftNum) &&
                        draftNum > 0 &&
                        Math.abs(draftNum - saved) > 0.02;
                      const hasDup = classesWithDuplicate.has(c.id);
                      const rowTone = hasDup
                        ? "bg-amber-500/[0.06]"
                        : changed
                          ? "bg-sky-500/[0.06]"
                          : idx % 2 === 0
                            ? "bg-white/[0.02]"
                            : "";

                      let status = "Not set";
                      let statusClass = "text-white/40 bg-white/5 border-white/10";
                      if (hasDup) {
                        status = "Duplicate";
                        statusClass = "text-amber-200 bg-amber-500/15 border-amber-500/30";
                      } else if (changed) {
                        status = "Changed";
                        statusClass = "text-sky-200 bg-sky-500/15 border-sky-500/30";
                      } else if (saved > 0) {
                        status = "Saved";
                        statusClass = "text-lime-200 bg-lime-500/10 border-lime-500/25";
                      }

                      return (
                        <tr key={c.id} className={`border-t border-white/5 ${rowTone}`}>
                          <td className="px-4 py-2.5 text-white/35 tabular-nums">{idx + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-white">{classLabel(c)}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}
                            >
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-white/60">
                            {saved > 0 ? saved.toLocaleString("en-IN") : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              type="number"
                              value={draft}
                              onChange={(e) =>
                                setClassAmounts((prev) => ({ ...prev, [c.id]: e.target.value }))
                              }
                              className={inputCompact}
                              placeholder="Enter amount"
                              disabled={tableSaving}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          </>
          )}

          {selectedClass && classView !== "all" ? (
            <SingleClassMessEditor
              classRef={selectedClass}
              extraFees={extraFees}
              classHeadName={classHeadName}
              draft={classAmounts[selectedClass.id] ?? ""}
              hasDuplicate={classesWithDuplicate.has(selectedClass.id)}
              tableSaving={tableSaving}
              onDraftChange={(value) =>
                setClassAmounts((prev) => ({ ...prev, [selectedClass.id]: value }))
              }
              onSave={saveSingleClass}
            />
          ) : null}

          {tableProgress && (
            <p className="text-center text-xs text-white/50">{tableProgress}</p>
          )}

          {classView === "all" && (
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-white/45">
              Showing {filteredClasses.length} of {sortedClasses.length} classes · only changed rows
              are saved
            </p>
            <PrimaryButton
              title={
                tableSaving
                  ? "Saving…"
                  : pendingChangeCount > 0
                    ? `Save ${pendingChangeCount} class(es)`
                    : "Save all class mess fees"
              }
              loading={tableSaving}
              onClick={saveAllClassAmounts}
            />
          </div>
          )}
        </div>
        )}
      </div>
    </section>
  );
}

function SingleClassMessEditor({
  classRef,
  extraFees,
  classHeadName,
  draft,
  hasDuplicate,
  tableSaving,
  onDraftChange,
  onSave,
}: {
  classRef: Class;
  extraFees: ExtraFee[];
  classHeadName: string;
  draft: string;
  hasDuplicate: boolean;
  tableSaving: boolean;
  onDraftChange: (value: string) => void;
  onSave: () => void;
}) {
  const saved = existingMessAmountForClass(extraFees, classHeadName, classRef.id);
  const draftNum = Number(draft);
  const changed =
    draft.trim() !== "" &&
    Number.isFinite(draftNum) &&
    draftNum > 0 &&
    Math.abs(draftNum - saved) > 0.02;

  let status = "Not set";
  let statusClass = "text-white/40 bg-white/5 border-white/10";
  if (hasDuplicate) {
    status = "Duplicate";
    statusClass = "text-amber-200 bg-amber-500/15 border-amber-500/30";
  } else if (changed) {
    status = "Changed";
    statusClass = "text-sky-200 bg-sky-500/15 border-sky-500/30";
  } else if (saved > 0) {
    status = "Saved";
    statusClass = "text-lime-200 bg-lime-500/10 border-lime-500/25";
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h5 className="text-base font-semibold text-white">{classLabel(classRef)}</h5>
          <p className="mt-0.5 text-xs text-white/45">Day scholars · 2 installments</p>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass}`}
        >
          {status}
        </span>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>In database (₹)</label>
          <p className="min-h-[42px] rounded-lg border border-white/10 bg-[#0B1220]/40 px-3 py-2.5 text-right text-sm tabular-nums text-white/70">
            {saved > 0 ? saved.toLocaleString("en-IN") : "—"}
          </p>
        </div>
        <div>
          <label className={labelClass} htmlFor={`mess-amt-${classRef.id}`}>
            New total (₹)
          </label>
          <input
            id={`mess-amt-${classRef.id}`}
            type="number"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            className={inputClass}
            placeholder="Enter amount"
            disabled={tableSaving}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <PrimaryButton
          title={tableSaving ? "Saving…" : changed ? "Save this class" : "Save class mess fee"}
          loading={tableSaving}
          onClick={onSave}
        />
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "sky" | "lime" | "amber" | "ok";
}) {
  const toneClass =
    tone === "sky"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-100"
      : tone === "lime"
        ? "border-lime-500/30 bg-lime-500/10 text-lime-100"
        : tone === "amber"
          ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
          : tone === "ok"
            ? "border-lime-500/25 bg-lime-500/5 text-lime-100/90"
            : "border-white/10 bg-white/5 text-white/80";
  return (
    <div className={`rounded-xl border px-3 py-2 text-center min-w-[4.5rem] ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
