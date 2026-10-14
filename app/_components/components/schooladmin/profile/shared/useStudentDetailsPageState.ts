import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { isInactiveStudentStatus } from "@/lib/students/resolveStudentDisplayClass";
import type { StudentDetail, StudentOption } from "./types";
import { buildPlaceholderById, buildPlaceholderDetail, normalizeStudentOption } from "./studentDetailHelpers";
import { useStudentFeeMutations } from "./useStudentFeeMutations";
import { useStudentListBootstrap } from "./useStudentListBootstrap";
import { useStudentDetailBundleLoading } from "./useStudentDetailBundleLoading";
import { useStudentSidebarPatch } from "./useStudentSidebarPatch";

export function useStudentDetailsPageState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const studentIdFromUrl = searchParams.get("studentId");
  const focusFromUrl = searchParams.get("focus");

  const [students, setStudents] = useState<StudentOption[]>([]);
  /** Seed from URL so `/api/student/:id` runs immediately instead of waiting for the full student list. */
  const [selectedId, setSelectedId] = useState<string | null>(studentIdFromUrl);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [feeBreakdown, setFeeBreakdown] = useState<AdminStudentFeeBreakdownResult | null>(null);
  const [feeBreakdownPending, setFeeBreakdownPending] = useState(false);
  const [transactionsReady, setTransactionsReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [classes, setClasses] = useState<{ id: string; name: string; section: string | null }[]>([]);
  const [bulkExtraFeeOpen, setBulkExtraFeeOpen] = useState(false);
  const [feesModalOpen, setFeesModalOpen] = useState(false);
  const [autoPrintPaymentId, setAutoPrintPaymentId] = useState<string | null>(null);
  /** Payments removed in-session — stale bundle loads must not restore these. */
  const deletedPaymentIdsRef = useRef(new Set<string>());
  const sidebarAsideRef = useRef<HTMLElement>(null);
  const [showStickyStudentName, setShowStickyStudentName] = useState(false);

  useStudentListBootstrap({
    studentIdFromUrl,
    students,
    setStudents,
    setListLoading,
    setClasses,
    setSelectedId,
    setDetail,
    selectedIdRef,
    setFeeBreakdown,
    setFeeBreakdownPending,
    setTransactionsReady,
  });

  const syncStudentIdInUrl = useCallback(
    (nextId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextId) params.set("studentId", nextId);
      else params.delete("studentId");
      const qs = params.toString();
      const base = pathname || "/";
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const selectStudent = useCallback(
    (student: StudentOption) => {
      setStudents((prev) => {
        if (prev.some((s) => s.id === student.id)) {
          return prev.map((s) => (s.id === student.id ? { ...s, ...student } : s));
        }
        return [student, ...prev];
      });
      if (selectedIdRef.current !== student.id) {
        // Immediate clear so the next paint never shows the previous student's fees.
        setFeeBreakdown(null);
        setFeeBreakdownPending(true);
        setTransactionsReady(false);
        setDetail(buildPlaceholderDetail(student));
      }
      setSelectedId(student.id);
      syncStudentIdInUrl(student.id);
    },
    [syncStudentIdInUrl]
  );

  const changeSelectedId = useCallback(
    (nextId: string | null) => {
      if (!nextId) {
        setSelectedId(null);
        setFeeBreakdown(null);
        setFeeBreakdownPending(false);
        setTransactionsReady(false);
        setDetail(null);
        syncStudentIdInUrl(null);
        return;
      }
      if (selectedIdRef.current !== nextId) {
        const fromList = students.find((s) => s.id === nextId);
        setFeeBreakdown(null);
        setFeeBreakdownPending(true);
        setTransactionsReady(false);
        setDetail(
          fromList
            ? buildPlaceholderDetail(normalizeStudentOption(fromList))
            : buildPlaceholderById(nextId)
        );
      }
      setSelectedId(nextId);
      syncStudentIdInUrl(nextId);
    },
    [students, syncStudentIdInUrl]
  );

  useLayoutEffect(() => {
    if (!detail || focusFromUrl !== "fees") return;
    document.getElementById("student-profile-fees-section")?.scrollIntoView({
      behavior: "instant",
      block: "start",
    });
  }, [detail, focusFromUrl]);

  useEffect(() => {
    deletedPaymentIdsRef.current.clear();
  }, [selectedId]);

  const { applyDetailsBundle, refreshFeesForStudent, removePaymentForStudent } = useStudentFeeMutations({
    setDetail,
    setFeeBreakdown,
    setTransactionsReady,
    deletedPaymentIdsRef,
    selectedIdRef,
  });

  const { warmFeeBreakdown } = useStudentDetailBundleLoading({
    selectedId,
    selectedIdRef,
    students,
    setStudents,
    detail,
    setDetail,
    feeBreakdown,
    setFeeBreakdown,
    setFeeBreakdownPending,
    setTransactionsReady,
    reloadKey,
    applyDetailsBundle,
  });

  const filtered = students.filter((s) => {
    if (filterStatus === "active" && isInactiveStudentStatus(s.status)) return false;
    if (filterStatus === "inactive" && !isInactiveStudentStatus(s.status)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !s.admissionNumber.toLowerCase().includes(q) &&
        !s.id.toLowerCase().includes(q)
      )
        return false;
    }
    if (filterClass && s.classId !== filterClass) return false;
    if (filterSection && s.section !== filterSection) return false;
    return true;
  });

  /** Options for the Students List <select>; must include selectedId or the browser can reset the value. */
  const studentSelectOptions = useMemo(() => {
    const inactiveTag = (st: StudentOption) =>
      isInactiveStudentStatus(st.status) ? " (Inactive)" : "";
    const core = filtered.map((s) => ({
      label: `${s.name} -${s.admissionNumber || "-"} | ${s.classDisplay || "-"} | ${s.parentName || "-"}${inactiveTag(s)}`,
      value: s.id,
    }));
    if (selectedId && !core.some((o) => o.value === selectedId)) {
      const st = students.find((s) => s.id === selectedId);
      if (st) {
        return [
          {
            label: `${st.name} -${st.admissionNumber || "-"} | ${st.classDisplay || "-"} | ${st.parentName || "-"}${inactiveTag(st)}`,
            value: st.id,
          },
          ...core,
        ];
      }
      return [{ label: "Student (from link) — loading…", value: selectedId }, ...core];
    }
    return core;
  }, [filtered, students, selectedId]);

  const selectedOption = filtered.find((s) => s.id === selectedId) ?? students.find((s) => s.id === selectedId) ?? filtered[0];
  const isSelectedInactive = detail ? isInactiveStudentStatus(detail.student.status) : false;
  const pageStudentName = useMemo(() => {
    const fromDetail = detail?.student.name?.trim();
    if (fromDetail && fromDetail !== "Loading…") return fromDetail;
    const fromList = selectedOption?.name?.trim();
    if (fromList && fromList !== "Unknown") return fromList;
    return null;
  }, [detail?.student.name, selectedOption?.name]);
  const pageStudentMeta = useMemo(() => {
    if (!detail?.student) return null;
    const parts = [
      detail.student.admissionNumber?.trim(),
      detail.student.class?.displayName?.trim(),
      detail.student.rollNo?.trim() ? `Roll ${detail.student.rollNo.trim()}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }, [detail?.student]);
  useEffect(() => {
    const aside = sidebarAsideRef.current;
    const scrollRoot = aside?.closest("main");
    if (!aside || !pageStudentName || !scrollRoot) {
      setShowStickyStudentName(false);
      return;
    }
    const update = () => {
      const asideBottom = aside.getBoundingClientRect().bottom;
      const rootTop = scrollRoot.getBoundingClientRect().top;
      setShowStickyStudentName(asideBottom < rootTop + 12);
    };
    update();
    scrollRoot.addEventListener("scroll", update, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", update);
  }, [pageStudentName, selectedId, detail?.student.id]);
  const classOptions = [{ label: "All Classes", value: "" }, ...classes.map((c) => ({ label: `${c.name}${c.section ? ` - ${c.section}` : ""}`, value: c.id }))];
  const statusOptions = [
    { label: "All Students", value: "all" },
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ];
  const sections = Array.from(new Set(classes.map((c) => c.section).filter(Boolean))) as string[];
  const sectionOptions = [{ label: "All Sections", value: "" }, ...sections.map((s) => ({ label: s, value: s }))];

  const { handleSidebarSaved } = useStudentSidebarPatch({
    selectedIdRef,
    setStudents,
    setDetail,
    setReloadKey,
  });

  return {
    students,
    selectedId,
    detail,
    feeBreakdown,
    feeBreakdownPending,
    transactionsReady,
    listLoading,
    searchQuery,
    setSearchQuery,
    filterClass,
    setFilterClass,
    filterSection,
    setFilterSection,
    filterStatus,
    setFilterStatus,
    classes,
    bulkExtraFeeOpen,
    setBulkExtraFeeOpen,
    feesModalOpen,
    setFeesModalOpen,
    autoPrintPaymentId,
    setAutoPrintPaymentId,
    sidebarAsideRef,
    showStickyStudentName,
    selectStudent,
    changeSelectedId,
    warmFeeBreakdown,
    refreshFeesForStudent,
    removePaymentForStudent,
    setReloadKey,
    studentSelectOptions,
    isSelectedInactive,
    pageStudentName,
    pageStudentMeta,
    classOptions,
    statusOptions,
    sectionOptions,
    handleSidebarSaved,
  };
}
