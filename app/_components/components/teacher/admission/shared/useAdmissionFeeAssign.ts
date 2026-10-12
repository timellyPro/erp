import { useCallback, useState } from "react";
import {
  invalidateAssignCatalogCache,
  peekAssignFeeCatalog,
} from "@/lib/fees/assignFeeCatalogCache";
import { loadAssignFeeCatalog } from "@/lib/fees/loadAssignFeeCatalog";
import { invalidateFeeBreakdownCache } from "@/lib/fees/feeBreakdownClientCache";
import { studentDetailsFeesUrlForPathname } from "../../../schooladmin/fees/studentDetailsNav";
import { normalizeResidencyType } from "./utils";
import type { AdmissionRow, FeeAssignRow, FeeHeadOption } from "./types";

export function useAdmissionFeeAssign({
  classes,
  pathname,
  router,
  setMessageTone,
  setMessage,
}: {
  classes: { id: string; name: string; section: string | null }[];
  pathname: string;
  router: { push: (url: string) => void };
  setMessageTone: (tone: "success" | "error") => void;
  setMessage: (message: string | null) => void;
}) {
  const [feeAssignDialog, setFeeAssignDialog] = useState<AdmissionRow | null>(null);
  const [feeAssignRows, setFeeAssignRows] = useState<FeeAssignRow[]>([]);
  const [assigningFees, setAssigningFees] = useState(false);
  const [assignFeeError, setAssignFeeError] = useState<string | null>(null);
  const [existingStudentExtras, setExistingStudentExtras] = useState<
    Array<{ id: string; name: string; amount: number; splitIntoTwoInstallments: boolean }>
  >([]);
  const [editingExistingFeeId, setEditingExistingFeeId] = useState<string | null>(null);
  const [editingExistingFeeName, setEditingExistingFeeName] = useState("");
  const [editingExistingFeeAmount, setEditingExistingFeeAmount] = useState("");
  const [editingExistingFeeSplit, setEditingExistingFeeSplit] = useState(false);
  const [dbFeeHeadOptions, setDbFeeHeadOptions] = useState<FeeHeadOption[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [classBaseFeeTotal, setClassBaseFeeTotal] = useState<number | null>(null);

  const seededFeeRowsForResidency = useCallback((residencyType: string | null | undefined): FeeAssignRow[] => {
    const now = Date.now();
    const normalized = normalizeResidencyType(residencyType);
    if (normalized === "Hosteller") {
      return [{ id: `seed-${now}`, name: "Hostel Fee", amount: "" }];
    }
    if (normalized === "Day Scholar") {
      return [{ id: `seed-${now}`, name: "Transport Fee", amount: "" }];
    }
    return [{ id: `seed-${now}`, name: "", amount: "" }];
  }, []);

  const applyAssignCatalog = useCallback((catalog: Awaited<ReturnType<typeof loadAssignFeeCatalog>>) => {
    setExistingStudentExtras(catalog.existingStudentExtras);
    setDbFeeHeadOptions(catalog.dbFeeHeadOptions as FeeHeadOption[]);
    setClassBaseFeeTotal(catalog.classBaseFeeTotal);
  }, []);

  const warmAssignCatalog = useCallback(
    (row: AdmissionRow) => {
      if (!row.studentId) return;
      const params = {
        studentId: row.studentId,
        classId: row.classId ?? row.class?.id ?? null,
        section: row.class?.section ?? null,
        residencyType: row.residencyType,
      };
      if (peekAssignFeeCatalog(params)) return;
      const classRows = classes.map((c) => ({
        id: c.id,
        name: c.name,
        section: c.section ?? null,
      }));
      void loadAssignFeeCatalog({ ...params, classRows }).catch(() => {});
    },
    [classes]
  );

  const openAssignFeesDialog = useCallback(
    (row: AdmissionRow) => {
      if (!row.studentId) {
        setMessageTone("error");
        setMessage("Approve enrollment first, then assign student-specific fees.");
        return;
      }
      const params = {
        studentId: row.studentId,
        classId: row.classId ?? row.class?.id ?? null,
        section: row.class?.section ?? null,
        residencyType: row.residencyType,
      };
      const classRows = classes.map((c) => ({
        id: c.id,
        name: c.name,
        section: c.section ?? null,
      }));

      setFeeAssignDialog(row);
      setFeeAssignRows(seededFeeRowsForResidency(row.residencyType));
      setAssignFeeError(null);

      const cached = peekAssignFeeCatalog(params);
      if (cached) {
        applyAssignCatalog(cached);
        setCatalogLoading(false);
      } else {
        setExistingStudentExtras([]);
        setDbFeeHeadOptions([]);
        setClassBaseFeeTotal(null);
        setCatalogLoading(true);
      }

      void loadAssignFeeCatalog({ ...params, classRows })
        .then(applyAssignCatalog)
        .catch(() => {})
        .finally(() => setCatalogLoading(false));
    },
    [applyAssignCatalog, classes, seededFeeRowsForResidency, setMessage, setMessageTone]
  );

  const addAssignFeeRow = () => {
    setFeeAssignRows((prev) => [
      ...prev,
      { id: `row-${Date.now()}-${Math.random()}`, name: "", amount: "", splitIntoTwoInstallments: false },
    ]);
  };

  const addSelectedDbHeadsToRows = () => {
    const selected = dbFeeHeadOptions.filter((x) => x.selected);
    if (selected.length === 0) return;
    setFeeAssignRows((prev) => [
      ...prev,
      ...selected.map((x) => ({
        id: `db-${Date.now()}-${Math.random()}`,
        name: x.name,
        amount: String(x.amount),
        residencyScope: x.residencyScope,
        splitIntoTwoInstallments: x.splitIntoTwoInstallments,
      })),
    ]);
    setDbFeeHeadOptions((prev) => prev.map((x) => ({ ...x, selected: false })));
  };

  const toggleDbFeeHeadOption = (key: string, selected: boolean) => {
    setDbFeeHeadOptions((prev) => prev.map((x) => (x.key === key ? { ...x, selected } : x)));
  };

  const patchFeeAssignRow = (id: string, patch: Partial<FeeAssignRow>) => {
    setFeeAssignRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const removeFeeAssignRow = (id: string) => {
    setFeeAssignRows((prev) => prev.filter((x) => x.id !== id));
  };

  const startEditExistingFee = (extra: { id: string; name: string; amount: number; splitIntoTwoInstallments: boolean }) => {
    setEditingExistingFeeId(extra.id);
    setEditingExistingFeeName(extra.name);
    setEditingExistingFeeAmount(String(extra.amount));
    setEditingExistingFeeSplit(extra.splitIntoTwoInstallments);
  };

  const cancelEditExistingFee = () => {
    setEditingExistingFeeId(null);
    setEditingExistingFeeName("");
    setEditingExistingFeeAmount("");
    setEditingExistingFeeSplit(false);
  };

  const updateExistingStudentFee = useCallback(async () => {
    if (!editingExistingFeeId) return;
    const name = editingExistingFeeName.trim();
    const amount = Number(editingExistingFeeAmount);
    if (!name || !Number.isFinite(amount) || amount <= 0) {
      setAssignFeeError("Enter valid fee name and amount.");
      return;
    }
    try {
      setAssignFeeError(null);
      const res = await fetch(`/api/fees/extra/${editingExistingFeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount, splitIntoTwoInstallments: editingExistingFeeSplit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to update fee");
      setExistingStudentExtras((prev) =>
        prev.map((x) =>
          x.id === editingExistingFeeId
            ? { ...x, name, amount, splitIntoTwoInstallments: editingExistingFeeSplit }
            : x
        )
      );
      setEditingExistingFeeId(null);
      setEditingExistingFeeName("");
      setEditingExistingFeeAmount("");
      setEditingExistingFeeSplit(false);
      setMessageTone("success");
      setMessage("Assigned fee updated.");
    } catch (e) {
      setAssignFeeError(e instanceof Error ? e.message : "Failed to update fee");
    }
  }, [editingExistingFeeAmount, editingExistingFeeId, editingExistingFeeName, editingExistingFeeSplit, setMessage, setMessageTone]);

  const deleteExistingStudentFee = useCallback(async (feeId: string) => {
    try {
      setAssignFeeError(null);
      const res = await fetch(`/api/fees/extra/${feeId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to delete fee");
      setExistingStudentExtras((prev) => prev.filter((x) => x.id !== feeId));
      setMessageTone("success");
      setMessage("Assigned fee deleted.");
    } catch (e) {
      setAssignFeeError(e instanceof Error ? e.message : "Failed to delete fee");
    }
  }, [setMessage, setMessageTone]);

  const saveAssignedFees = useCallback(async () => {
    if (!feeAssignDialog?.studentId) return;
    const cleaned = feeAssignRows
      .map((r) => ({
        name: r.name.trim(),
        amount: Number(r.amount),
        residencyScope: r.residencyScope,
        splitIntoTwoInstallments: r.splitIntoTwoInstallments === true,
      }))
      .filter((r) => r.name.length > 0 && Number.isFinite(r.amount) && r.amount > 0);

    if (cleaned.length === 0) {
      setAssignFeeError("Add at least one fee with valid name and amount.");
      return;
    }

    setAssigningFees(true);
    setAssignFeeError(null);
    try {
      const res = await fetch("/api/fees/extra/batch-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentId: feeAssignDialog.studentId,
          fees: cleaned,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to assign fees");

      const savedStudentId = feeAssignDialog.studentId;
      invalidateAssignCatalogCache(savedStudentId);
      invalidateFeeBreakdownCache(savedStudentId);
      setFeeAssignDialog(null);
      setFeeAssignRows([]);
      setMessageTone("success");
      setMessage("Student fees assigned successfully. Opening student profile…");
      router.push(studentDetailsFeesUrlForPathname(pathname, savedStudentId));
    } catch (e) {
      setAssignFeeError(e instanceof Error ? e.message : "Failed to assign fees");
    } finally {
      setAssigningFees(false);
    }
  }, [feeAssignDialog, feeAssignRows, pathname, router, setMessage, setMessageTone]);

  return {
    feeAssignDialog,
    setFeeAssignDialog,
    feeAssignRows,
    assigningFees,
    assignFeeError,
    existingStudentExtras,
    editingExistingFeeId,
    editingExistingFeeName,
    editingExistingFeeAmount,
    editingExistingFeeSplit,
    setEditingExistingFeeName,
    setEditingExistingFeeAmount,
    setEditingExistingFeeSplit,
    dbFeeHeadOptions,
    catalogLoading,
    classBaseFeeTotal,
    warmAssignCatalog,
    openAssignFeesDialog,
    addAssignFeeRow,
    addSelectedDbHeadsToRows,
    toggleDbFeeHeadOption,
    patchFeeAssignRow,
    removeFeeAssignRow,
    startEditExistingFee,
    cancelEditExistingFee,
    updateExistingStudentFee,
    deleteExistingStudentFee,
    saveAssignedFees,
  };
}
