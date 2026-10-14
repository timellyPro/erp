import { useEffect, useMemo, useState } from "react";
import type { Class } from "../../types";
import type { TransactionItem } from "../../RefundModal";
import {
  fetchFeesTransactions,
  peekFeesTransactions,
  resolveFeesTransactionsCacheKey,
} from "@/lib/fees/feesTransactionsCache";
import { fetchClassDetail, fetchFeeCollectors } from "@/lib/api/feeTransactions";

const PAGE_SIZE = 20;

export interface ClassDetailStudent {
  id: string;
  admissionNumber: string;
  user?: { name?: string | null } | null;
  class?: { section?: string | null } | null;
}

export function useFeeTransactionsListState({
  schoolId,
  classes,
  onSuccess,
}: {
  schoolId: string | null;
  classes: Class[];
  onSuccess: () => void;
}) {
  const cacheKey = resolveFeesTransactionsCacheKey(schoolId);
  const initialTx = peekFeesTransactions(cacheKey);
  const [transactions, setTransactions] = useState<TransactionItem[]>(initialTx ?? []);
  const [loading, setLoading] = useState(initialTx === null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [classStudents, setClassStudents] = useState<ClassDetailStudent[]>([]);
  const [refundTarget, setRefundTarget] = useState<TransactionItem | null>(null);
  const [page, setPage] = useState(1);
  const [collectorOptions, setCollectorOptions] = useState<Array<{ label: string; value: string }>>([
    { label: "All staff", value: "" },
  ]);
  const [selectedCollectorUserId, setSelectedCollectorUserId] = useState("");

  const fetchClassDetails = async (classId: string) => {
    if (!classId) {
      setClassStudents([]);
      setSelectedSection("");
      return;
    }
    setSectionLoading(true);
    try {
      const { ok, data } = await fetchClassDetail(classId);
      if (ok && data.class) {
        setSelectedSection("");
        setClassStudents(Array.isArray(data.class.students) ? data.class.students : []);
      } else {
        setSelectedSection("");
        setClassStudents([]);
      }
    } catch {
      setSelectedSection("");
      setClassStudents([]);
    } finally {
      setSectionLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchFeeCollectors(controller.signal)
      .then(({ data }) => {
        const rows = Array.isArray(data?.collectors) ? data.collectors : [];
        setCollectorOptions([
          { label: "All staff", value: "" },
          ...rows.map((c: { userId: string; name: string }) => ({
            label: c.name,
            value: c.userId,
          })),
        ]);
      })
      .catch(() => {
        /* ignore */
      });
    return () => controller.abort();
  }, [schoolId]);

  useEffect(() => {
    const key = resolveFeesTransactionsCacheKey(schoolId);
    const cached = !selectedCollectorUserId ? peekFeesTransactions(key) : null;
    if (!selectedCollectorUserId) {
      if (cached && cached.length > 0) {
        setTransactions(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
    } else {
      setLoading(true);
    }

    const controller = new AbortController();
    void fetchFeesTransactions(schoolId, {
      revalidate: Boolean(selectedCollectorUserId) || Boolean(cached?.length),
      collectedByUserId: selectedCollectorUserId || undefined,
      limit: selectedCollectorUserId ? 500 : 200,
      signal: controller.signal,
    })
      .then((rows) => {
        if (!controller.signal.aborted) setTransactions(rows);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Fee transactions load error:", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [schoolId, selectedCollectorUserId]);

  useEffect(() => {
    fetchClassDetails(selectedClassId);
  }, [selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  );

  const sectionOptions = useMemo(() => {
    if (!selectedClass) return [];
    const sectionFromClass = selectedClass.section || "";
    const sectionFromStudents = Array.from(
      new Set(
        classStudents
          .map((s) => s.class?.section || "")
          .filter((x) => x !== "")
      )
    );
    const unique = Array.from(new Set([sectionFromClass, ...sectionFromStudents].filter(Boolean)));
    return [
      { label: "All Sections", value: "" },
      ...unique.map((s) => ({ label: s, value: s })),
    ];
  }, [selectedClass, classStudents]);

  const yearOptions = useMemo(() => {
    const years = Array.from(
      new Set(
        transactions.map((t) => String(new Date(t.createdAt).getFullYear()))
      )
    ).sort((a, b) => Number(b) - Number(a));
    return [
      { label: "All Years", value: "" },
      ...years.map((y) => ({ label: y, value: y })),
    ];
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const txClassName = t.student.class?.name || "";
      const txSection = t.student.class?.section || "";
      const txYear = String(new Date(t.createdAt).getFullYear());
      const txStudentName = t.student.user?.name || "";
      const txAdmission = t.student.admissionNumber || "";

      const matchClass = selectedClass ? txClassName === selectedClass.name : true;
      const matchSection = selectedSection ? txSection === selectedSection : true;
      const matchYear = selectedYear ? txYear === selectedYear : true;
      const search = studentSearch.trim().toLowerCase();
      const matchStudent =
        !search ||
        txStudentName.toLowerCase().includes(search) ||
        txAdmission.toLowerCase().includes(search);

      return matchClass && matchSection && matchYear && matchStudent;
    });
  }, [transactions, selectedClass, selectedSection, selectedYear, studentSearch]);

  useEffect(() => {
    setPage(1);
  }, [selectedClassId, selectedSection, selectedYear, studentSearch, selectedCollectorUserId]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginatedTransactions = useMemo(
    () => filteredTransactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTransactions, page]
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return {
    PAGE_SIZE,
    loading,
    sectionLoading,
    selectedClassId,
    setSelectedClassId,
    selectedSection,
    setSelectedSection,
    selectedYear,
    setSelectedYear,
    studentSearch,
    setStudentSearch,
    refundTarget,
    setRefundTarget,
    page,
    setPage,
    collectorOptions,
    selectedCollectorUserId,
    setSelectedCollectorUserId,
    sectionOptions,
    yearOptions,
    filteredTransactions,
    totalPages,
    paginatedTransactions,
    onRefundSuccess: () => {
      if (schoolId) {
        void fetchFeesTransactions(schoolId, { revalidate: true }).then(setTransactions);
      }
      onSuccess();
    },
  };
}
