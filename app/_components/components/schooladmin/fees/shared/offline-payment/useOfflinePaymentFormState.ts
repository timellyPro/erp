import { useEffect, useMemo, useState } from "react";
import type { ExtraFee, FeeStructure, Student } from "../../types";
import {
  fetchFeeBreakdown,
  recordOfflinePayment,
  type SelectedHead,
} from "@/lib/api/offlinePayment";
import { getErrorMessage } from "@/lib/errors/errorInfo";
import { useIdempotencyKey } from "@/lib/utils/idempotencyKey";

export type { SelectedHead };

export function useOfflinePaymentFormState({
  structures,
  extraFees,
  students,
  onSuccess,
}: {
  structures: FeeStructure[];
  extraFees: ExtraFee[];
  students: Student[];
  onSuccess: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedHeads, setSelectedHeads] = useState<SelectedHead[]>([]);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [refNo, setRefNo] = useState("");
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useIdempotencyKey();

  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [remainingFee, setRemainingFee] = useState<number>(0);
  const [dueHeads, setDueHeads] = useState<
    Array<{ key: string; headType: "BASE_COMPONENT" | "EXTRA_FEE"; label: string; dueBefore: number }>
  >([]);

  const resetForm = () => {
    idempotencyKey.renew();
    setShowForm(false);
    setStudentId("");
    setSelectedClassId("");
    setSelectedSection("");
    setSelectedHeads([]);
    setAmount("");
    setRefNo("");
    setPaymentMode("Cash");
  };

  const handleSubmit = async () => {
    if (!studentId || !amount || Number(amount) <= 0) {
      alert("Select student and enter amount");
      return;
    }
    if (selectedHeads.length === 0) {
      alert("Select at least one fee head");
      return;
    }
    setSaving(true);
    try {
      const { ok, data } = await recordOfflinePayment({
        studentId,
        amount: Number(amount),
        paymentMode,
        refNo: refNo || undefined,
        selectedHeads,
        clientRequestId: idempotencyKey.getOrCreate(),
      });
      if (!ok) {
        alert(data.message || "Failed to record payment");
        return;
      }
      resetForm();
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  const sectionOptions = useMemo(() => {
    if (!selectedClassId) return [];
    const sections = new Set<string>();
    for (const s of students) {
      if (s.class?.id !== selectedClassId) continue;
      if (s.class?.section) sections.add(s.class.section);
    }
    return Array.from(sections).sort();
  }, [selectedClassId, students]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (selectedClassId && s.class?.id !== selectedClassId) return false;
      if (selectedSection && s.class?.section !== selectedSection) return false;
      return true;
    });
  }, [students, selectedClassId, selectedSection]);

  const getHeadKey = (head: SelectedHead) => {
    if (head.headType === "BASE_COMPONENT") return `BASE:${head.componentIndex}`;
    return `EXTRA:${head.extraFeeId}`;
  };

  const headOptions = useMemo(() => {
    const heads: Array<{ key: string; label: string; head: SelectedHead }> = [];
    dueHeads.forEach((h) => {
      if (h.headType === "BASE_COMPONENT") {
        const raw = h.key.replace("BASE:", "");
        const componentIndex = Number(raw);
        if (!Number.isNaN(componentIndex)) {
          heads.push({
            key: h.key,
            label: h.label,
            head: {
              headType: "BASE_COMPONENT",
              componentIndex,
              componentName: h.label,
            },
          });
        }
        return;
      }
      if (h.headType === "EXTRA_FEE" && h.key.startsWith("EXTRA:")) {
        heads.push({
          key: h.key,
          label: h.label,
          head: {
            headType: "EXTRA_FEE",
            extraFeeId: h.key.slice("EXTRA:".length),
          },
        });
      }
    });
    return heads;
  }, [dueHeads]);

  const toggleHead = (head: SelectedHead) => {
    const key = getHeadKey(head);
    setSelectedHeads((prev) => {
      const exists = prev.some((h) => getHeadKey(h) === key);
      if (exists) return prev.filter((h) => getHeadKey(h) !== key);
      return [...prev, head];
    });
  };

  useEffect(() => {
    let cancelled = false;

    const loadBreakdown = async () => {
      if (!studentId) {
        setDueHeads([]);
        setRemainingFee(0);
        setBreakdownError(null);
        return;
      }

      setBreakdownLoading(true);
      setBreakdownError(null);

      try {
        const { ok, data } = await fetchFeeBreakdown(studentId);

        if (!ok) {
          if (!cancelled) setBreakdownError(data.message || "Failed to load due breakdown");
          return;
        }

        if (!cancelled) {
          setRemainingFee(Number(data.remainingFee) || 0);
          setDueHeads(Array.isArray(data.dueHeads) ? data.dueHeads : []);
        }
      } catch (e: unknown) {
        if (!cancelled) setBreakdownError(getErrorMessage(e) || "Failed to load due breakdown");
      } finally {
        if (!cancelled) setBreakdownLoading(false);
      }
    };

    loadBreakdown();
    return () => {
      cancelled = true;
    };
  }, [studentId, structures, extraFees]);

  const dueByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of dueHeads) m.set(h.key, Number(h.dueBefore) || 0);
    return m;
  }, [dueHeads]);

  const numericAmount = Number(amount);
  const preview = useMemo(() => {
    if (!studentId) return null;
    if (!numericAmount || numericAmount <= 0) return null;
    if (!dueHeads || dueHeads.length === 0) return null;
    if (selectedHeads.length === 0) return null;
    if (numericAmount > remainingFee + 0.01) return null;

    const all = headOptions.map((h) => ({ key: h.key, dueBefore: dueByKey.get(h.key) ?? 0 }));
    const selectedKeySet = new Set(selectedHeads.map((h) => getHeadKey(h)));
    const selected = all.filter((h) => selectedKeySet.has(h.key));
    const unselected = all.filter((h) => !selectedKeySet.has(h.key));

    const selectedDueSum = selected.reduce((s, h) => s + h.dueBefore, 0);
    const unselectedDueSum = unselected.reduce((s, h) => s + h.dueBefore, 0);

    const allocateProportional = (
      amountToAlloc: number,
      heads: Array<{ key: string; dueBefore: number }>
    ): Map<string, number> => {
      const sum = heads.reduce((s, h) => s + h.dueBefore, 0);
      const out = new Map<string, number>();
      if (amountToAlloc <= 0 || sum <= 0) return out;
      const eligible = heads.filter((h) => h.dueBefore > 0);
      if (eligible.length === 0) return out;
      let remaining = amountToAlloc;
      for (let i = 0; i < eligible.length; i++) {
        const h = eligible[i];
        const value =
          i === eligible.length - 1
            ? Math.min(remaining, h.dueBefore)
            : (amountToAlloc * h.dueBefore) / sum;
        out.set(h.key, (out.get(h.key) ?? 0) + value);
        remaining -= value;
      }
      return out;
    };

    const allocateSelected = Math.min(numericAmount, selectedDueSum);
    const spill = numericAmount - allocateSelected;

    const allocationsByKey = new Map<string, number>();
    for (const [k, v] of allocateProportional(allocateSelected, selected)) {
      allocationsByKey.set(k, v);
    }

    if (spill > 0.00001) {
      if (unselectedDueSum <= 0) return null;
      for (const [k, v] of allocateProportional(spill, unselected)) {
        allocationsByKey.set(k, (allocationsByKey.get(k) ?? 0) + v);
      }
    }

    const items = selectedHeads.map((h) => {
      const key = getHeadKey(h);
      const dueBefore = dueByKey.get(key) ?? 0;
      const dec = allocationsByKey.get(key) ?? 0;
      const dueAfter = Math.max(dueBefore - dec, 0);
      return { key, dueBefore, dec, dueAfter };
    });

    return { items };
  }, [dueByKey, dueHeads, headOptions, numericAmount, remainingFee, selectedHeads, studentId]);

  return {
    showForm,
    setShowForm,
    selectedClassId,
    setSelectedClassId,
    selectedSection,
    setSelectedSection,
    studentId,
    setStudentId,
    amount,
    setAmount,
    selectedHeads,
    setSelectedHeads,
    paymentMode,
    setPaymentMode,
    refNo,
    setRefNo,
    saving,
    breakdownLoading,
    breakdownError,
    remainingFee,
    handleSubmit,
    sectionOptions,
    filteredStudents,
    headOptions,
    toggleHead,
    dueByKey,
    numericAmount,
    preview,
    resetForm,
  };
}
