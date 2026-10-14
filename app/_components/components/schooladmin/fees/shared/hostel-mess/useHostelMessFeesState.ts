import { useCallback, useEffect, useMemo, useState } from "react";
import type { Class, ExtraFee } from "../../types";
import {
  countMessDuplicateExtraFeeIds,
  findMessFeeDuplicateIssues,
} from "@/lib/fees/findMessFeeDuplicateIssues";
import {
  classLabel,
  combinedAmount,
  existingMessAmountForClass,
  patchTargetId,
  resolveCatalogHead,
} from "./hostelMessFeesUtils";
import {
  cleanupExtraFeeDuplicates,
  createExtraFee,
  patchExtraFee,
} from "@/lib/api/hostelMessFees";

export function useHostelMessFeesState({
  classes,
  extraFees,
  schoolResidencyHeadName,
  classHeadName,
  onSuccess,
}: {
  classes: Class[];
  extraFees: ExtraFee[];
  schoolResidencyHeadName: string;
  classHeadName: string;
  onSuccess: () => void;
}) {
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
      const { ok, data } = targetId
        ? await patchExtraFee(targetId, body)
        : await createExtraFee({
            name: schoolResidencyHeadName,
            amount: amt,
            targetType: "SCHOOL",
            residencyScope: "HOSTELLER",
            splitIntoTwoInstallments: true,
          });
      if (!ok) {
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
      const { ok, data } = await patchExtraFee(targetId, patchBody);
      if (!ok) return { ok: false, message: data.message || "Failed to update fee" };
      return { ok: true };
    }
    const { ok, data } = await createExtraFee({
      name: classHeadName,
      amount: amt,
      targetType: "CLASS",
      targetClassId: classId,
      residencyScope: "DAY_SCHOLAR",
      splitIntoTwoInstallments: true,
    });
    if (!ok) return { ok: false, message: data.message || "Failed to save fee" };
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
      const { ok, data } = await cleanupExtraFeeDuplicates();
      if (!ok) {
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

  return {
    sortedClasses,
    duplicateIssues,
    duplicateRowCount,
    schoolHead,
    schoolAmount,
    setSchoolAmount,
    schoolSaving,
    saveSchoolHead,
    classAmounts,
    setClassAmounts,
    fillAllValue,
    setFillAllValue,
    classSearch,
    setClassSearch,
    tableSaving,
    tableProgress,
    cleanupBusy,
    showDuplicateList,
    setShowDuplicateList,
    classView,
    setClassView,
    applyFillAllToTable,
    runDuplicateCleanup,
    saveAllClassAmounts,
    filteredClasses,
    configuredCount,
    pendingChangeCount,
    classesWithDuplicate,
    schoolScopeMismatch,
    selectedClass,
    saveSingleClass,
    classViewSelectValue,
  };
}
