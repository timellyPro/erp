"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AcademicPerformance } from "./components/AcademicPerformance";
import { FeeTransactions } from "./components/FeeTransactions";
import { FeesBreakdown } from "./components/FeesBreakdown";
import { ProfileSidebar } from "./components/ProfileSidebar";
import { AttendanceTrends } from "./components/AttendanceTrends";
import { Certificates } from "./components/Certificates";
import type { StudentDetailsTabPayload } from "@/lib/buildStudentDetailsTabPayload";
import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";
import {
  invalidateStudentDetailsBundleCache,
  loadStudentDetailsBundle,
  peekStudentDetailsBundle,
  refreshStudentFeesAfterMutation,
} from "@/lib/loadStudentDetailsBundle";
import { dueHeadRowsFromBreakdown, type DueHeadRow } from "@/lib/feeBreakdownPaymentRows";
import {
  fetchFeeBreakdownFast,
  getFeeBreakdownCached,
  setFeeBreakdownCache,
} from "@/lib/feeBreakdownClientCache";
import { readStudentListCache, writeStudentListCache } from "@/lib/studentListSessionCache";
import { StudentSearchAutocomplete } from "./components/StudentSearchAutocomplete";
import { Calendar, BookOpen, Activity, Clock, FileSpreadsheet, X } from "lucide-react";
import BulkExtraFeeByTimellyModal from "./components/BulkExtraFeeByTimellyModal";
import PageHeader from "../../common/PageHeader";
import Spinner from "../../common/Spinner";
import SelectInput from "../../common/SelectInput";

type StudentDetail = {
  student: {
    id: string;
    name: string;
    schoolName: string;
    admissionNumber: string;
    email: string;
    photoUrl?: string | null;
    rollNo: string;
    age: number | null;
    address: string;
    phone: string;
    fatherName: string;
    motherName?: string;
    fatherPhone?: string;
    motherPhone?: string;
    residencyType?: string;
    gender?: string;
    class: { id: string; name: string; section: string | null; displayName: string } | null;
    applicationFee: number | null;
    admissionFee: number | null;
    createdAt?: string;
  };
  fee: {
    baseTotalFee: number;
    discountPercent: number;
    discountFixedAmount?: number | null;
    totalFee: number;
    amountPaid: number;
    remainingFee: number;
    tuitionPaid?: number;
    moneyForStudent: number | null;
    discountFeeHeadKey?: string | null;
    discountFeeHeadLabel?: string | null;
    discountRemarks?: string | null;
  } | null;
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    method: string;
    createdAt: string;
    transactionId: string | null;
    feeTypeName?: string;
    feeTypeAmount?: number;
    feeAllocations?: Array<{ name: string; amount: number }>;
  }>;
  attendanceTrends: Array<{ month: string; present: number; total: number; pct: number }>;
  academicPerformance: Array<{ subject: string; score: number }>;
  certificates: Array<{
    id: string;
    title: string;
    issuedDate: string;
    issuedBy: string | null;
    certificateUrl: string | null;
  }>;
};

type StudentOption = {
  id: string;
  name: string;
  admissionNumber: string;
  parentName: string;
  classDisplay: string;
  classId: string;
  section: string | null;
};

/** List cache may hold fees-page rows (class object) or profile rows (classDisplay). */
function normalizeStudentOption(raw: {
  id: string;
  name?: string;
  admissionNumber?: string;
  parentName?: string;
  fatherName?: string;
  classDisplay?: string;
  classId?: string;
  section?: string | null;
  user?: { name?: string | null };
  class?: { id: string; name: string; section: string | null } | null;
}): StudentOption {
  const classDisplay =
    raw.classDisplay?.trim() ||
    (raw.class
      ? `${raw.class.name}${raw.class.section ? `-${raw.class.section}` : ""}`
      : "-");
  const dash = classDisplay.indexOf("-");
  return {
    id: raw.id,
    name: raw.name?.trim() || raw.user?.name?.trim() || "Unknown",
    admissionNumber: raw.admissionNumber ?? "",
    parentName: raw.parentName?.trim() || raw.fatherName?.trim() || "-",
    classDisplay,
    classId: raw.classId ?? raw.class?.id ?? "",
    section: raw.section ?? (dash > 0 ? classDisplay.slice(dash + 1) : raw.class?.section ?? null),
  };
}

/** Instant UI while API loads — uses data already on the student list. */
function buildPlaceholderDetail(st: StudentOption): StudentDetail {
  const opt = normalizeStudentOption(st);
  const dash = opt.classDisplay.indexOf("-");
  const className = dash > 0 ? opt.classDisplay.slice(0, dash) : opt.classDisplay;
  const section = dash > 0 ? opt.classDisplay.slice(dash + 1) : opt.section;
  const parent = opt.parentName === "-" ? "" : opt.parentName;
  return {
    student: {
      id: opt.id,
      name: opt.name,
      schoolName: "",
      admissionNumber: opt.admissionNumber,
      email: "",
      photoUrl: null,
      rollNo: "",
      age: null,
      address: "",
      phone: "",
      fatherName: parent,
      motherName: "",
      fatherPhone: "",
      motherPhone: "",
      residencyType: "Day Scholar",
      gender: "",
      applicationFee: null,
      admissionFee: null,
      class: opt.classId
        ? {
            id: opt.classId,
            name: className,
            section,
            displayName: opt.classDisplay,
          }
        : null,
    },
    fee: null,
    payments: [],
    attendanceTrends: [],
    academicPerformance: [],
    certificates: [],
  };
}

function buildPlaceholderById(studentId: string): StudentDetail {
  return {
    student: {
      id: studentId,
      name: "Loading…",
      schoolName: "",
      admissionNumber: "",
      email: "",
      photoUrl: null,
      rollNo: "",
      age: null,
      address: "",
      phone: "",
      fatherName: "",
      motherName: "",
      fatherPhone: "",
      motherPhone: "",
      residencyType: "Day Scholar",
      gender: "",
      applicationFee: null,
      admissionFee: null,
      class: null,
    },
    fee: null,
    payments: [],
    attendanceTrends: [],
    academicPerformance: [],
    certificates: [],
  };
}

type FeePaymentSuccess = {
  payment: {
    id: string;
    amount: number;
    status: string;
    gateway?: string;
    createdAt: string;
    transactionId?: string | null;
  };
  updatedFee: {
    amountPaid: number;
    remainingFee: number;
    finalFee?: number;
    totalFee?: number;
  };
  feeAllocations?: Array<{ name: string; amount: number; key?: string }>;
};

function patchDetailAfterPayment(
  prev: StudentDetail | null,
  result: FeePaymentSuccess,
  fallbackLines?: Array<{ name: string; amount: number }>
): StudentDetail | null {
  if (!prev?.fee) return prev;
  const { payment, updatedFee } = result;
  const lines =
    result.feeAllocations && result.feeAllocations.length > 0
      ? result.feeAllocations
      : fallbackLines ?? [{ name: "Fee payment", amount: payment.amount }];

  const gateway = String(payment.gateway ?? "OFFLINE_CASH");
  const createdAt =
    typeof payment.createdAt === "string"
      ? payment.createdAt
      : new Date(payment.createdAt).toISOString();

  return {
    ...prev,
    fee: {
      ...prev.fee,
      amountPaid: updatedFee.amountPaid,
      remainingFee: updatedFee.remainingFee,
      totalFee: updatedFee.finalFee ?? prev.fee.totalFee,
    },
    payments: [
      {
        id: payment.id,
        amount: payment.amount,
        status: payment.status || "SUCCESS",
        method: gateway,
        createdAt,
        transactionId: payment.transactionId ?? null,
        feeAllocations: lines,
      },
      ...prev.payments.filter((p) => p.id !== payment.id),
    ],
  };
}

function normalizeBreakdownHeadKey(raw: string): string {
  const key = raw.trim();
  if (key.startsWith("BASE:")) return key.split("::")[0]!;
  if (key.startsWith("EXTRA:")) return key.split("::")[0]!;
  return key;
}

function patchBreakdownTotalsOnly(
  prev: AdminStudentFeeBreakdownResult | null,
  updatedFee: FeePaymentSuccess["updatedFee"]
): AdminStudentFeeBreakdownResult | null {
  if (!prev) return prev;
  return {
    ...prev,
    amountPaid: updatedFee.amountPaid,
    remainingFee: updatedFee.remainingFee,
    finalFee: updatedFee.finalFee ?? prev.finalFee,
    totalAmount: prev.totalAmount,
  };
}

function patchBreakdownAfterDelete(
  prev: AdminStudentFeeBreakdownResult | null,
  updatedFee: FeePaymentSuccess["updatedFee"]
): AdminStudentFeeBreakdownResult | null {
  if (!prev) return prev;
  const allCleared = updatedFee.amountPaid <= 0.00001;
  const dueHeads = allCleared
    ? prev.dueHeads.map((h) => ({ ...h, dueBefore: h.snapshotAmount }))
    : prev.dueHeads;
  return {
    ...prev,
    amountPaid: updatedFee.amountPaid,
    remainingFee: updatedFee.remainingFee,
    finalFee: updatedFee.finalFee ?? prev.finalFee,
    totalAmount: prev.totalAmount,
    dueHeads,
  };
}

function patchBreakdownAfterPayment(
  prev: AdminStudentFeeBreakdownResult | null,
  result: FeePaymentSuccess
): AdminStudentFeeBreakdownResult | null {
  if (!prev) return prev;
  const { updatedFee, feeAllocations } = result;

  const deductByKey = new Map<string, number>();
  for (const line of feeAllocations ?? []) {
    const key =
      typeof (line as { key?: string }).key === "string"
        ? normalizeBreakdownHeadKey((line as { key: string }).key)
        : "";
    if (!key) continue;
    deductByKey.set(key, (deductByKey.get(key) ?? 0) + (Number(line.amount) || 0));
  }

  const dueHeads =
    deductByKey.size > 0
      ? prev.dueHeads.map((h) => {
          const deduct = deductByKey.get(normalizeBreakdownHeadKey(h.key)) ?? 0;
          if (deduct <= 0) return h;
          const dueBefore = Math.max(Math.round((h.dueBefore - deduct) * 100) / 100, 0);
          return { ...h, dueBefore };
        })
      : prev.dueHeads;

  return {
    ...prev,
    amountPaid: updatedFee.amountPaid,
    remainingFee: updatedFee.remainingFee,
    finalFee: updatedFee.finalFee ?? prev.finalFee,
    totalAmount: prev.totalAmount,
    dueHeads,
  };
}

type FeeDeleteSuccess = {
  paymentId: string;
  updatedFee: {
    amountPaid: number;
    remainingFee: number;
    finalFee?: number;
  } | null;
};

function patchDetailAfterDelete(
  prev: StudentDetail | null,
  deleteResult: FeeDeleteSuccess
): StudentDetail | null {
  if (!prev) return prev;
  const { paymentId, updatedFee } = deleteResult;
  return {
    ...prev,
    payments: prev.payments.filter((p) => p.id !== paymentId),
    fee:
      prev.fee && updatedFee
        ? {
            ...prev.fee,
            amountPaid: updatedFee.amountPaid,
            remainingFee: updatedFee.remainingFee,
            totalFee: updatedFee.finalFee ?? prev.fee.totalFee,
          }
        : prev.fee,
  };
}

function StudentDetailsPageContent() {
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
  const [listLoading, setListLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [classes, setClasses] = useState<{ id: string; name: string; section: string | null }[]>([]);
  const [bulkExtraFeeOpen, setBulkExtraFeeOpen] = useState(false);
  const [feesModalOpen, setFeesModalOpen] = useState(false);

  const [dropdownListLoaded, setDropdownListLoaded] = useState(false);

  useEffect(() => {
    const cached = readStudentListCache<StudentOption>();
    if (cached?.length) {
      setStudents(cached.map((s) => normalizeStudentOption(s)));
      setListLoading(false);
      setDropdownListLoaded(true);
    }

    let cancelled = false;

    const mapListRow = (s: {
      id: string;
      user?: { name?: string };
      admissionNumber?: string;
      fatherName?: string;
      parentName?: string;
      class?: { id: string; name: string; section: string | null };
    }): StudentOption => ({
      id: s.id,
      name: s.user?.name ?? "Unknown",
      admissionNumber: s.admissionNumber ?? "",
      parentName: s.fatherName?.trim() || s.parentName?.trim() || "-",
      classDisplay: s.class ? `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}` : "-",
      classId: s.class?.id ?? "",
      section: s.class?.section ?? null,
    });

    const loadDropdownList = async () => {
      if (dropdownListLoaded || cancelled) return;
      try {
        const res = await fetch("/api/student/list?take=100", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data?.students) ? data.students : [];
        const list = rows.map(mapListRow);
        if (list.length > 0) {
          setStudents(list);
          writeStudentListCache(list);
        }
        setDropdownListLoaded(true);
      } catch {
        /* keep search API as fallback */
      }
    };

    (async () => {
      try {
        const classesRes = await fetch("/api/class/list", { credentials: "include" });
        if (!cancelled && classesRes.ok) {
          const c = await classesRes.json();
          setClasses(c.classes ?? []);
        }

        if (studentIdFromUrl) {
          setListLoading(false);
          return;
        }

        if (!cached?.length) {
          await loadDropdownList();
        }
        if (!cancelled) setListLoading(false);
      } catch {
        if (!cancelled && !cached?.length) setStudents([]);
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep link skips bulk list
  }, [studentIdFromUrl]);

  // Deep link (?studentId=…): follow the URL when it changes. Do NOT depend on `students` here — that
  // was resetting selection back to the URL id on every list refresh and overwrote the student's dropdown pick.
  useEffect(() => {
    if (studentIdFromUrl) {
      setSelectedId(studentIdFromUrl);
    }
  }, [studentIdFromUrl]);

  useEffect(() => {
    if (studentIdFromUrl) return;
    if (students.length === 0) return;
    setSelectedId((prev) => (prev && students.some((s) => s.id === prev) ? prev : students[0].id));
  }, [students, studentIdFromUrl]);

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
    (id: string) => {
      setSelectedId(id);
      syncStudentIdInUrl(id);
    },
    [syncStudentIdInUrl]
  );

  const warmFeeBreakdown = useCallback(() => {
    if (!selectedId) return;
    const cached = getFeeBreakdownCached(selectedId);
    if (cached) {
      setFeeBreakdown(cached);
      setFeeBreakdownPending(false);
      return;
    }
    if (feeBreakdown) return;
    void fetchFeeBreakdownFast(selectedId).then((breakdown) => {
      if (breakdown) {
        setFeeBreakdown(breakdown);
        setFeeBreakdownPending(false);
      }
    });
  }, [selectedId, feeBreakdown]);

  useLayoutEffect(() => {
    if (!detail || focusFromUrl !== "fees") return;
    document.getElementById("student-profile-fees-section")?.scrollIntoView({
      behavior: "instant",
      block: "start",
    });
  }, [detail, focusFromUrl]);

  const applyDetailsBundle = useCallback(
    (bundle: Awaited<ReturnType<typeof loadStudentDetailsBundle>>) => {
      const { feeBreakdown: breakdown, ...rest } = bundle;
      if (rest?.student) {
        setDetail(rest);
        setFeeBreakdown(breakdown ?? null);
        if (breakdown && rest.student.id) setFeeBreakdownCache(rest.student.id, breakdown);
      } else {
        setDetail(null);
        setFeeBreakdown(null);
      }
    },
    []
  );

  const refreshFeesForStudent = useCallback(
    async (studentId: string, paymentResult?: FeePaymentSuccess) => {
      if (paymentResult) {
        setDetail((prev) => patchDetailAfterPayment(prev, paymentResult));
        setFeeBreakdown((prev) => {
          const next = patchBreakdownAfterPayment(prev, paymentResult);
          if (next) setFeeBreakdownCache(studentId, next);
          return next;
        });
        setDetail((prev) => {
          if (prev?.student.id === studentId) {
            void refreshStudentFeesAfterMutation(studentId, {
              keepShell: prev as unknown as StudentDetailsTabPayload,
              keepPatchedBreakdown: true,
              onPartial: (partial) => {
                if (partial.student?.id === studentId) applyDetailsBundle(partial);
              },
            });
          }
          return prev;
        });
        return;
      }

      const bundle = await refreshStudentFeesAfterMutation(studentId, {
        onPartial: (partial) => {
          if (partial.student?.id === studentId) applyDetailsBundle(partial);
        },
      });
      if (bundle?.student?.id === studentId) {
        applyDetailsBundle(bundle);
      }
    },
    [applyDetailsBundle]
  );

  const removePaymentForStudent = useCallback(
    (studentId: string, deleteResult: FeeDeleteSuccess) => {
      setDetail((prev) => patchDetailAfterDelete(prev, deleteResult));
      if (deleteResult.updatedFee) {
        setFeeBreakdown((prev) => {
          const next = patchBreakdownAfterDelete(prev, deleteResult.updatedFee!);
          if (next) setFeeBreakdownCache(studentId, next);
          return next;
        });
      }
      setDetail((prev) => {
        if (prev?.student.id === studentId) {
          void refreshStudentFeesAfterMutation(studentId, {
            keepShell: prev as unknown as StudentDetailsTabPayload,
            keepPatchedBreakdown: true,
            onPartial: (partial) => {
              if (partial.student?.id === studentId) applyDetailsBundle(partial);
            },
          });
        }
        return prev;
      });
    },
    [applyDetailsBundle]
  );

  useEffect(() => {
    if (reloadKey === 0) return;
    const id = selectedIdRef.current;
    if (id) invalidateStudentDetailsBundleCache(id);
  }, [reloadKey]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setFeeBreakdown(null);
      return;
    }

    let cancelled = false;

    const cached = peekStudentDetailsBundle(selectedId);
    if (cached) {
      applyDetailsBundle(cached);
      setFeeBreakdownPending(false);
      return;
    }

    const cachedBreakdown = getFeeBreakdownCached(selectedId);
    setDetail((prev) => {
      if (prev?.student.id === selectedId) return prev;
      const fromList = students.find((s) => s.id === selectedId);
      return fromList
        ? buildPlaceholderDetail(normalizeStudentOption(fromList))
        : buildPlaceholderById(selectedId);
    });
    if (cachedBreakdown) {
      setFeeBreakdown(cachedBreakdown);
      setFeeBreakdownPending(false);
    } else {
      setFeeBreakdownPending(true);
    }

    loadStudentDetailsBundle(selectedId, {
      onShellLoaded: (partial) => {
        if (cancelled) return;
        const { feeBreakdown: bd, ...rest } = partial;
        if (rest?.student) {
          setDetail(rest);
          setStudents((prev) => {
            if (prev.some((s) => s.id === rest.student.id)) return prev;
            const row = normalizeStudentOption({
              id: rest.student.id,
              name: rest.student.name,
              admissionNumber: rest.student.admissionNumber,
              fatherName: rest.student.fatherName,
              classDisplay: rest.student.class?.displayName,
              classId: rest.student.class?.id,
              section: rest.student.class?.section,
            });
            return [row, ...prev];
          });
        }
        if (bd) {
          setFeeBreakdown(bd);
          setFeeBreakdownPending(false);
        }
      },
      onBreakdownLoaded: (bd) => {
        if (cancelled) return;
        setFeeBreakdown(bd);
        setFeeBreakdownPending(false);
      },
      onExtrasLoaded: (full) => {
        if (cancelled) return;
        applyDetailsBundle(full);
      },
    })
      .then((bundle) => {
        if (cancelled) return;
        applyDetailsBundle(bundle);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Student details error:", err);
      })
      .finally(() => {
        if (!cancelled) setFeeBreakdownPending(false);
      });

    return () => {
      cancelled = true;
    };
    // `students` read for placeholder only — must not restart fetch when list hydrates
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [selectedId, reloadKey, applyDetailsBundle]);

  const filtered = students.filter((s) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.admissionNumber.toLowerCase().includes(q)) return false;
    }
    if (filterClass && s.classId !== filterClass) return false;
    if (filterSection && s.section !== filterSection) return false;
    return true;
  });

  /** Options for the Students List <select>; must include selectedId or the browser can reset the value. */
  const studentSelectOptions = useMemo(() => {
    const core = filtered.map((s) => ({
      label: `${s.name} -${s.admissionNumber || "-"} | ${s.classDisplay || "-"} | ${s.parentName || "-"}`,
      value: s.id,
    }));
    if (selectedId && !core.some((o) => o.value === selectedId)) {
      const st = students.find((s) => s.id === selectedId);
      if (st) {
        return [
          {
            label: `${st.name} -${st.admissionNumber || "-"} | ${st.classDisplay || "-"} | ${st.parentName || "-"}`,
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
  const classOptions = [{ label: "All Classes", value: "" }, ...classes.map((c) => ({ label: `${c.name}${c.section ? ` - ${c.section}` : ""}`, value: c.id }))];
  const sections = Array.from(new Set(classes.map((c) => c.section).filter(Boolean))) as string[];
  const sectionOptions = [{ label: "All Sections", value: "" }, ...sections.map((s) => ({ label: s, value: s }))];

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 max-w-[1600px] mx-auto min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden pb-6 sm:pb-8">
      <PageHeader
        title="Student Details"
        subtitle="View comprehensive academic and personal records."
        rightSlot={
          <div className="w-full sm:w-auto flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => setBulkExtraFeeOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-lime-500/40 bg-lime-500/15 px-3 py-2 text-xs sm:text-sm font-semibold text-lime-200 hover:bg-lime-500/25 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              Bulk extra fees (Excel)
            </button>
            <div className="bg-[#0F172A]/40 border border-white/10 px-3 py-2 sm:px-4 rounded-xl text-xs sm:text-sm text-gray-200 whitespace-nowrap text-center">
              {new Date().getFullYear() - 1}-{new Date().getFullYear() + 1}
            </div>
          </div>
        }
      />
      <BulkExtraFeeByTimellyModal
        open={bulkExtraFeeOpen}
        onClose={() => setBulkExtraFeeOpen(false)}
        onApplied={() => setReloadKey((k) => k + 1)}
      />
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-6 overflow-visible relative z-20 min-w-0">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4 md:gap-6 overflow-visible">
          <div>
            <StudentSearchAutocomplete
              students={students}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelectStudent={selectStudent}
              selectedId={selectedId}
              classFilter={filterClass}
              sectionFilter={filterSection}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-2 block">Filter by Class</label>
            <SelectInput
              value={filterClass}
              onChange={setFilterClass}
              options={classOptions}
              bgColor="black"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-2 block">Filter by Section</label>
            <SelectInput
              value={filterSection}
              onChange={setFilterSection}
              options={sectionOptions}
              bgColor="black"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-2 block">Students List</label>
            <SelectInput
              value={selectedId ?? ""}
              onChange={(value) => {
                const next = value || null;
                setSelectedId(next);
                syncStudentIdInUrl(next);
              }}
              options={[{ label: "Select student", value: "" }, ...studentSelectOptions]}
              bgColor="black"
            />
          </div>
        </div>
      </div>

      {listLoading && students.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-sm">Loading student list…</div>
      )}

      {detail && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8 min-w-0">
          <div className="lg:col-span-1 min-w-0">
            <ProfileSidebar
              studentId={detail.student.id}
              student={{
                name: detail.student.name,
                id: detail.student.admissionNumber,
                className: detail.student.class?.displayName ?? "-",
                rollNo: detail.student.rollNo,
                age: String(detail.student.age ?? "-"),
                email: detail.student.email,
                phone: detail.student.phone,
                address: detail.student.address || "—",
                photoUrl: detail.student.photoUrl ?? undefined,
              }}
              fatherName={detail.student.fatherName}
              fatherPhone={detail.student.fatherPhone}
              motherName={detail.student.motherName}
              motherPhone={detail.student.motherPhone}
              classId={detail.student.class?.id ?? null}
              classes={classes.map((c) => ({
                id: c.id,
                label: `${c.name}${c.section ? ` - ${c.section}` : ""}`,
              }))}
              gender={detail.student.gender ?? ""}
              residencyType={detail.student.residencyType ?? "Day Scholar"}
              onSaved={(patch) => {
                if (patch) {
                  setDetail((current) =>
                    current
                      ? {
                          ...current,
                          student: {
                            ...current.student,
                            fatherName: patch.fatherName,
                            fatherPhone: patch.fatherPhone,
                            motherName: patch.motherName,
                            motherPhone: patch.motherPhone,
                            phone: patch.fatherPhone,
                          },
                        }
                      : current
                  );
                }
                setReloadKey((k) => k + 1);
              }}
              onOpenFees={() => {
                warmFeeBreakdown();
                setFeesModalOpen(true);
              }}
              onFeesHover={warmFeeBreakdown}
            />
          </div>

          <div className="lg:col-span-3 space-y-4 sm:space-y-6 md:space-y-8 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="p-2 bg-lime-400/10 rounded-xl flex-shrink-0">
                  <Calendar className="w-5 h-5 sm:w-5 sm:h-5 text-lime-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs text-gray-500">Attendance</p>
                  <p className="text-base sm:text-lg font-bold text-white truncate">
                    {detail.attendanceTrends.length
                      ? `${Math.round(detail.attendanceTrends.reduce((a, t) => a + t.pct, 0) / detail.attendanceTrends.length)}%`
                      : "-"}
                  </p>
                  <p className="text-[10px] text-lime-400">Avg this year</p>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="p-2 text-white rounded-xl flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Avg Grade</p>
                  <p className="text-lg font-bold text-white">
                    {detail.academicPerformance.length ? "A" : "-"}
                  </p>
                  <p className="text-[10px] text-blue-400">Academic Rank: —</p>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="p-2 bg-pink-400/10 rounded-xl flex-shrink-0">
                  <Activity className="w-5 h-5 text-pink-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Behavior</p>
                  <p className="text-lg font-bold text-pink-400">—</p>
                  <p className="text-[10px] text-pink-400">—</p>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-2xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="p-2 bg-amber-400/10 rounded-xl flex-shrink-0">
                  <Clock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fees Due</p>
                  <p className="text-lg font-bold text-lime-400">
                    {detail.fee && detail.fee.remainingFee > 0
                      ? `₹${detail.fee.remainingFee.toLocaleString()}`
                      : "₹0"}
                  </p>
                  <p className="text-[10px] text-lime-400">
                    {detail.fee && detail.fee.remainingFee <= 0 ? "All Cleared" : "Pending"}
                  </p>
                </div>
              </div>
            </div>

            <AcademicPerformance data={detail.academicPerformance} />

            <AttendanceTrends data={detail.attendanceTrends} />
            <FeeTransactions
              fee={detail.fee}
              feeBreakdown={feeBreakdown}
              payments={detail.payments}
              applicationFee={detail.student.applicationFee}
              admissionFee={detail.student.admissionFee}
              studentCreatedAt={detail.student.createdAt}
              studentName={detail.student.name}
              studentId={detail.student.id}
              admissionNumber={detail.student.admissionNumber}
              classDisplayName={detail.student.class?.displayName ?? "-"}
              residencyType={detail.student.residencyType ?? "Day Scholar"}
              parentName={detail.student.fatherName?.trim() || "-"}
              motherName={detail.student.motherName?.trim() || "-"}
              parentPhone={
                detail.student.fatherPhone?.trim() ||
                detail.student.phone?.trim() ||
                "-"
              }
              onPaymentsChanged={() => {
                if (detail.student.id) void refreshFeesForStudent(detail.student.id);
              }}
              onPaymentDeleted={(result) => {
                if (detail.student.id) removePaymentForStudent(detail.student.id, result);
              }}
            />

            {detail.fee && (
              <>
                <FeesBreakdown
                  studentId={detail.student.id}
                  classId={detail.student.class?.id ?? null}
                  totalFee={feeBreakdown?.totalAmount ?? detail.fee.totalFee}
                  baseTotalFee={detail.fee.baseTotalFee}
                  discountPercent={detail.fee.discountPercent}
                  amountPaid={feeBreakdown?.amountPaid ?? detail.fee.amountPaid}
                  remainingFee={feeBreakdown?.remainingFee ?? detail.fee.remainingFee}
                  payments={detail.payments}
                  studentName={detail.student.name}
                  admissionNumber={detail.student.admissionNumber}
                  classDisplayName={detail.student.class?.displayName ?? "-"}
                  classSection={detail.student.class?.section ?? null}
                  schoolName={detail.student.schoolName}
                  discountFeeHeadKey={detail.fee.discountFeeHeadKey}
                  discountFeeHeadLabel={detail.fee.discountFeeHeadLabel}
                  discountRemarks={detail.fee.discountRemarks}
                  discountFixedAmount={detail.fee.discountFixedAmount}
                  onFeeModified={(paymentResult) => {
                    if (detail.student.id) void refreshFeesForStudent(detail.student.id, paymentResult);
                  }}
                  residencyType={detail.student.residencyType ?? null}
                  initialFeeBreakdown={feeBreakdown}
                  feeBreakdownPending={feeBreakdownPending}
                />
              </>
            )}

            <div className="mt-8">
              <Certificates certificates={detail.certificates} />
            </div>
          </div>
        </div>
      )}

      {!detail && selectedId && !listLoading && (
        <div className="text-center py-12 text-gray-400">Student not found.</div>
      )}

      {feesModalOpen && detail ? (
        <StudentFeesPaymentModal
          studentId={detail.student.id}
          studentName={detail.student.name}
          initialFeeBreakdown={feeBreakdown ?? getFeeBreakdownCached(detail.student.id)}
          breakdownPending={feeBreakdownPending}
          onClose={() => setFeesModalOpen(false)}
          onSuccess={(result) => {
            setFeesModalOpen(false);
            void refreshFeesForStudent(detail.student.id, result);
          }}
        />
      ) : null}

      {!detail && !selectedId && !listLoading && students.length === 0 && (
        <div className="text-center py-12 text-gray-400">No students found.</div>
      )}
    </div>
  );
}

function dueToPayInputString(due: number): string {
  if (!Number.isFinite(due) || due <= 0) return "";
  return String(Math.round(due * 100) / 100);
}

/** Plain text amount field: digits and one decimal, max 2 fractional digits */
function sanitizeMoneyInput(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const intPart = cleaned.slice(0, dot).replace(/\D/g, "");
  const frac = cleaned.slice(dot + 1).replace(/\D/g, "").slice(0, 2);
  return frac.length > 0 ? `${intPart}.${frac}` : `${intPart}.`;
}

function StudentFeesPaymentModal({
  studentId,
  studentName,
  initialFeeBreakdown,
  breakdownPending = false,
  onClose,
  onSuccess,
}: {
  studentId: string;
  studentName: string;
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null;
  breakdownPending?: boolean;
  onClose: () => void;
  onSuccess: (result: FeePaymentSuccess) => void;
}) {
  const seedRows = dueHeadRowsFromBreakdown(
    initialFeeBreakdown ?? getFeeBreakdownCached(studentId)
  );
  const [rows, setRows] = useState<DueHeadRow[]>(seedRows);
  const [loading, setLoading] = useState(seedRows.length === 0 && breakdownPending);
  const [saving, setSaving] = useState(false);
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [mode, setMode] = useState<"CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS">("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = dueHeadRowsFromBreakdown(initialFeeBreakdown);
    if (next.length > 0) {
      setRows((prev) => {
        const payByKey = new Map(prev.map((r) => [r.key, r.payAmount]));
        const entireByKey = new Map(prev.map((r) => [r.key, r.payEntireHead]));
        return next.map((r) => ({
          ...r,
          payAmount: payByKey.get(r.key) ?? r.payAmount,
          payEntireHead: entireByKey.get(r.key) ?? r.payEntireHead,
        }));
      });
      setLoading(false);
    }
  }, [initialFeeBreakdown]);

  useEffect(() => {
    if (rows.length > 0) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchFeeBreakdownFast(studentId);
        if (!cancelled && data) {
          setRows(dueHeadRowsFromBreakdown(data));
          setPaymentDate(new Date().toISOString().slice(0, 10));
        } else if (!cancelled && !data) {
          throw new Error("Failed to load fee heads");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load fee heads");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId, rows.length]);

  const setRowAmount = (key: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = sanitizeMoneyInput(value);
        const parsed = Number(next);
        const matchesFull =
          next.trim() !== "" &&
          Number.isFinite(parsed) &&
          parsed > 0 &&
          Math.abs(parsed - r.dueBefore) <= 0.01;
        return { ...r, payAmount: next, payEntireHead: matchesFull };
      })
    );
    setShowPaymentStep(false);
  };

  const togglePayEntireHead = (key: string, checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        if (checked) {
          return {
            ...r,
            payEntireHead: true,
            payAmount: dueToPayInputString(r.dueBefore),
          };
        }
        return { ...r, payEntireHead: false, payAmount: "" };
      })
    );
    setShowPaymentStep(false);
  };

  const total = rows.reduce((s, r) => s + (Number(r.payAmount) > 0 ? Number(r.payAmount) : 0), 0);
  const selectedRows = rows.filter((r) => Number(r.payAmount) > 0);
  const totals = rows.reduce(
    (acc, r) => {
      acc.totalAmount += r.totalAmount;
      acc.discountAmount += r.discountAmount;
      acc.paidAmount += r.paidAmount;
      acc.balance += r.dueBefore;
      return acc;
    },
    { totalAmount: 0, discountAmount: 0, paidAmount: 0, balance: 0 }
  );
  totals.totalAmount = Math.round(totals.totalAmount * 100) / 100;
  totals.discountAmount = Math.round(totals.discountAmount * 100) / 100;
  totals.paidAmount = Math.round(totals.paidAmount * 100) / 100;
  totals.balance = Math.round(totals.balance * 100) / 100;

  const continueToPayment = () => {
    setError(null);
    if (selectedRows.length === 0) {
      setError("Enter amount in at least one fee head.");
      return;
    }
    for (const r of selectedRows) {
      const n = Number(r.payAmount);
      if (!Number.isFinite(n) || n <= 0) {
        setError(`Invalid amount for ${r.label}`);
        return;
      }
      if (n > r.dueBefore + 0.01) {
        setError(`Amount for ${r.label} cannot exceed due ₹${r.dueBefore.toLocaleString("en-IN")}`);
        return;
      }
    }
    setShowPaymentStep(true);
  };

  const submit = async () => {
    setError(null);
    if (selectedRows.length === 0) {
      setError("Enter amount in at least one fee head.");
      return;
    }
    for (const r of selectedRows) {
      const n = Number(r.payAmount);
      if (!Number.isFinite(n) || n <= 0) {
        setError(`Invalid amount for ${r.label}`);
        return;
      }
      if (n > r.dueBefore + 0.01) {
        setError(`Amount for ${r.label} cannot exceed due ₹${r.dueBefore.toLocaleString("en-IN")}`);
        return;
      }
    }
    if (mode !== "CASH" && !referenceNo.trim()) {
      setError("Reference / UTR is required for non-cash payment.");
      return;
    }

    const selectedHeads = selectedRows
      .map((r) => {
        const sourceKey = r.sourceKey || r.key;
        if (sourceKey.startsWith("BASE:")) {
          const idx = Number(sourceKey.slice("BASE:".length));
          if (!Number.isFinite(idx)) return null;
          return {
            headType: "BASE_COMPONENT" as const,
            componentIndex: idx,
            componentName: r.label,
          };
        }
        if (sourceKey.startsWith("EXTRA:")) {
          return {
            headType: "EXTRA_FEE" as const,
            extraFeeId: sourceKey.slice("EXTRA:".length),
          };
        }
        return null;
      })
      .filter((h): h is { headType: "BASE_COMPONENT"; componentIndex: number; componentName: string } | { headType: "EXTRA_FEE"; extraFeeId: string } => h !== null);

    if (selectedHeads.length === 0) {
      setError("Could not parse selected fee heads.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/fees/offline-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          studentId,
          amount: total,
          paymentMode: mode,
          refNo: referenceNo.trim() || undefined,
          transactionId: referenceNo.trim() || undefined,
          paymentDate,
          selectedHeads,
          explicitAllocations: selectedRows.map((r) => ({
            key: r.sourceKey || r.key,
            amount: Number(r.payAmount),
            label: r.label,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Payment failed");
      }
      const paymentResult: FeePaymentSuccess = {
        payment: {
          id: String(data.payment?.id ?? ""),
          amount: Number(data.payment?.amount ?? total),
          status: String(data.payment?.status ?? "SUCCESS"),
          gateway: typeof data.payment?.gateway === "string" ? data.payment.gateway : mode,
          createdAt:
            typeof data.payment?.createdAt === "string"
              ? data.payment.createdAt
              : paymentDate
                ? `${paymentDate}T12:00:00.000Z`
                : new Date().toISOString(),
          transactionId:
            typeof data.payment?.transactionId === "string" ? data.payment.transactionId : referenceNo.trim() || null,
        },
        updatedFee: {
          amountPaid: Number(data.updatedFee?.amountPaid ?? 0),
          remainingFee: Number(data.updatedFee?.remainingFee ?? 0),
          finalFee:
            typeof data.updatedFee?.finalFee === "number" ? data.updatedFee.finalFee : undefined,
          totalFee:
            typeof data.updatedFee?.totalFee === "number" ? data.updatedFee.totalFee : undefined,
        },
        feeAllocations: Array.isArray(data.feeAllocations)
          ? data.feeAllocations.map((line: { name?: string; amount?: number }) => ({
              name: String(line?.name ?? "Fee"),
              amount: Number(line?.amount ?? 0),
            }))
          : selectedRows.map((r) => ({
              name: r.label,
              amount: Number(r.payAmount),
            })),
      };
      onSuccess(paymentResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#0B1220] p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white">Fees Sheet — {studentName}</h4>
            <p className="text-xs text-white/60 mt-1">Enter amount per head like a spreadsheet, then submit payment.</p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {rows.length === 0 && loading ? (
          <div className="py-10 text-center text-white/70"><Spinner /></div>
        ) : (
          <>
            <div className="max-h-[360px] overflow-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[1040px] text-sm">
                <thead className="bg-white/5 text-left text-white/70">
                  <tr>
                    <th className="px-3 py-2">Fee Type</th>
                    <th className="px-3 py-2">Total Amount</th>
                    <th className="px-3 py-2">Discount</th>
                    <th className="px-3 py-2">Paid Amount</th>
                    <th className="px-3 py-2">Balance</th>
                    <th className="w-14 px-2 py-2 text-center" title="Pay full balance for this head">
                      All
                    </th>
                    <th className="px-3 py-2">Record Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-white/5">
                      <td className="px-3 py-2 text-white">{r.label}</td>
                      <td className="px-3 py-2 text-white">₹{Math.round(r.totalAmount).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-cyan-300">₹{Math.round(r.discountAmount).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-lime-300">₹{Math.round(r.paidAmount).toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-amber-300">₹{Math.round(r.dueBefore).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-2 text-center align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-lime-400 disabled:cursor-not-allowed disabled:opacity-40"
                          checked={r.payEntireHead}
                          disabled={r.dueBefore <= 0}
                          onChange={(e) => togglePayEntireHead(r.key, e.target.checked)}
                          aria-label={`Pay full balance for ${r.label}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={r.payAmount}
                          onChange={(e) => setRowAmount(r.key, e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                          placeholder="0.00"
                          aria-label={`Record fee for ${r.label}`}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/10 bg-white/5 font-semibold">
                    <td className="px-3 py-2 text-white">Total</td>
                    <td className="px-3 py-2 text-white">₹{Math.round(totals.totalAmount).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-cyan-300">₹{Math.round(totals.discountAmount).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-lime-300">₹{Math.round(totals.paidAmount).toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-amber-300">₹{Math.round(totals.balance).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2" />
                    <td className="px-3 py-2 text-blue-300">₹{total.toLocaleString("en-IN")}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {!showPaymentStep ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={continueToPayment}
                  className="rounded-xl bg-blue-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400"
                >
                  Continue
                </button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-white/60">Payment mode</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as "CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS")}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                  >
                    <option value="CASH">Cash</option>
                    <option value="ONLINE">Online</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="DD">DD</option>
                    <option value="OTHERS">Others</option>
                  </select>
                </div>
                {mode !== "CASH" ? (
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs text-white/60">Reference / UTR</label>
                    <input
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                      placeholder="Enter transaction reference"
                    />
                  </div>
                ) : (
                  <div className="md:col-span-2 flex items-end">
                    <p className="text-xs text-lime-300">Cash selected: UTR not required.</p>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs text-white/60">Payment date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white"
                  />
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-lime-500/30 bg-lime-500/10 px-3 py-2 text-sm text-lime-200">
              Total to pay now: ₹{total.toLocaleString("en-IN")}
            </div>
            {error ? (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !saving && onClose()}
                disabled={saving}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || !showPaymentStep}
                className="rounded-xl bg-lime-500/90 px-4 py-2 text-sm font-semibold text-black hover:bg-lime-400 disabled:opacity-50"
              >
                {saving ? "Processing..." : "Pay & Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function StudentDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-white/70">
          <Spinner />
        </div>
      }
    >
      <StudentDetailsPageContent />
    </Suspense>
  );
}
