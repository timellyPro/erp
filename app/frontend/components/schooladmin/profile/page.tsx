"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
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
import { extraFeeIdFromAllocationKey, normalizeFeeAllocationKey } from "@/lib/feeAllocationKeys";
import { isPreviousYearFeeHeadName } from "@/lib/feeYearClassification";
import {
  fetchFeeBreakdownFast,
  getFeeBreakdownCached,
  invalidateFeeBreakdownCache,
  setFeeBreakdownCache,
} from "@/lib/feeBreakdownClientCache";
import { readStudentListCacheLegacy, clearStudentListCache, writeStudentListCacheLegacy } from "@/lib/studentListSessionCache";
import { isInactiveStudentStatus } from "@/lib/resolveStudentDisplayClass";
import { resolveStudentDisplayName } from "@/lib/resolveStudentDisplayName";
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
    dob?: string;
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
    status?: string;
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
    discountApprovals?: Array<{
      id: string;
      status: "PENDING" | "APPROVED" | "REJECTED";
      discountFixedAmount?: number | null;
      discountFeeHeadLabel?: string | null;
      discountRemarks?: string | null;
      createdAt?: string;
    }>;
  } | null;
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    method: string;
    createdAt: string;
    transactionId: string | null;
    collectedByName?: string | null;
    collectedByUserId?: string | null;
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
  status?: string;
  rollNo?: string | null;
  penNumber?: string | null;
  apaarId?: string | null;
};

function StudentNameCard({
  name,
  meta,
  className = "",
}: {
  name: string;
  meta?: string | null;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 min-w-0 ${className}`}>
      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">Name</p>
      <p className="text-xs sm:text-sm font-bold text-white truncate">{name}</p>
      {meta ? <p className="text-[10px] text-gray-400 truncate mt-0.5">{meta}</p> : null}
    </div>
  );
}

/** List cache may hold fees-page rows (class object) or profile rows (classDisplay). */
function normalizeStudentOption(raw: {
  id: string;
  name?: string;
  admissionNumber?: string;
  parentName?: string;
  fatherName?: string;
  rollNo?: string | null;
  penNumber?: string | null;
  apaarId?: string | null;
  classDisplay?: string;
  classId?: string;
  section?: string | null;
  user?: { name?: string | null };
  class?: { id: string; name: string; section: string | null } | null;
  status?: string;
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
    status: raw.status ?? "Active",
    rollNo: raw.rollNo ?? null,
    penNumber: raw.penNumber ?? null,
    apaarId: raw.apaarId ?? null,
  };
}

function patchDetailShell(prev: StudentDetail | null, shell: StudentDetail): StudentDetail {
  if (!shell?.student) return prev ?? shell;
  const sameStudent = prev?.student.id === shell.student.id;
  return {
    student: shell.student,
    fee: shell.fee,
    payments: sameStudent ? (prev?.payments ?? []) : [],
    attendanceTrends: sameStudent ? (prev?.attendanceTrends ?? []) : [],
    academicPerformance: sameStudent ? (prev?.academicPerformance ?? []) : [],
    certificates: sameStudent ? (prev?.certificates ?? []) : [],
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
      status: opt.status ?? "Active",
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
    collectedByName?: string | null;
    collectedByUserId?: string | null;
  };
  updatedFee: {
    amountPaid: number;
    remainingFee: number;
    finalFee?: number;
    totalFee?: number;
  };
  feeAllocations?: Array<{ name: string; amount: number; key?: string }>;
};

function buildConfirmedPaymentResult(
  data: Record<string, unknown>,
  total: number,
  mode: string,
  paymentDate: string,
  referenceNo: string,
  selectedRows: DueHeadRow[],
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null,
  collector?: { collectedByName?: string | null; collectedByUserId?: string | null }
): FeePaymentSuccess {
  const payment = data.payment as Record<string, unknown> | undefined;
  const updatedFee = data.updatedFee as Record<string, unknown> | undefined;
  const apiCollectorName =
    typeof payment?.collectedByName === "string" ? payment.collectedByName.trim() : "";
  const apiCollectorUserId =
    typeof payment?.collectedByUserId === "string" ? payment.collectedByUserId : null;
  return {
    payment: {
      id: String(payment?.id ?? ""),
      amount: Number(payment?.amount ?? total),
      status: String(payment?.status ?? "SUCCESS"),
      gateway: typeof payment?.gateway === "string" ? payment.gateway : mode,
      createdAt:
        typeof payment?.createdAt === "string"
          ? payment.createdAt
          : paymentDate
            ? `${paymentDate}T12:00:00.000Z`
            : new Date().toISOString(),
      transactionId:
        typeof payment?.transactionId === "string" ? payment.transactionId : referenceNo.trim() || null,
      collectedByName: apiCollectorName || collector?.collectedByName || null,
      collectedByUserId: apiCollectorUserId || collector?.collectedByUserId || null,
    },
    updatedFee: {
      amountPaid: Number(
        updatedFee?.amountPaid ?? (initialFeeBreakdown?.amountPaid ?? 0) + total
      ),
      remainingFee: Number(
        updatedFee?.remainingFee ?? Math.max((initialFeeBreakdown?.remainingFee ?? 0) - total, 0)
      ),
      finalFee:
        typeof updatedFee?.finalFee === "number"
          ? updatedFee.finalFee
          : initialFeeBreakdown?.finalFee,
      totalFee:
        typeof updatedFee?.totalFee === "number"
          ? updatedFee.totalFee
          : initialFeeBreakdown?.totalAmount,
    },
    feeAllocations: Array.isArray(data.feeAllocations)
      ? (data.feeAllocations as Array<{ name?: string; amount?: number; key?: string }>).map(
          (line) => ({
            name: String(line?.name ?? "Fee"),
            amount: Number(line?.amount ?? 0),
            key: typeof line?.key === "string" ? line.key : undefined,
          })
        )
      : selectedRows.map((r) => ({
          name: r.label,
          amount: Number(r.payAmount),
          key: r.sourceKey || r.key,
        })),
  };
}

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
        collectedByName: payment.collectedByName ?? null,
        collectedByUserId: payment.collectedByUserId ?? null,
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
  const { feeAllocations } = result;

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

  // Breakdown metrics are current-year only — never copy StudentFee amountPaid/remaining
  // (those include previous-year payments and zero out "Fees Due" incorrectly).
  const currentYearHeads = dueHeads.filter((h) => !isPreviousYearFeeHeadName(h.label));
  const previousYearHeads = dueHeads.filter((h) => isPreviousYearFeeHeadName(h.label));
  const round = (n: number) => Math.round(n * 100) / 100;
  const totalAmount = round(currentYearHeads.reduce((s, h) => s + (Number(h.snapshotAmount) || 0), 0));
  const remainingFee = round(currentYearHeads.reduce((s, h) => s + (Number(h.dueBefore) || 0), 0));
  const amountPaid = round(
    currentYearHeads.reduce(
      (s, h) => s + Math.max((Number(h.snapshotAmount) || 0) - (Number(h.dueBefore) || 0), 0),
      0
    )
  );
  const previousYearTotalAmount = round(
    previousYearHeads.reduce((s, h) => s + (Number(h.snapshotAmount) || 0), 0)
  );
  const previousYearRemainingFee = round(
    previousYearHeads.reduce((s, h) => s + (Number(h.dueBefore) || 0), 0)
  );
  const previousYearAmountPaid = round(
    previousYearHeads.reduce(
      (s, h) => s + Math.max((Number(h.snapshotAmount) || 0) - (Number(h.dueBefore) || 0), 0),
      0
    )
  );

  return {
    ...prev,
    amountPaid,
    remainingFee,
    finalFee: totalAmount,
    totalAmount,
    previousYearTotalAmount,
    previousYearAmountPaid,
    previousYearRemainingFee,
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
  feeAllocations?: Array<{ name: string; amount: number; key?: string }>;
};

function isSuccessPaymentStatus(status: string) {
  const u = String(status || "").toUpperCase();
  return u === "SUCCESS" || u === "COMPLETED";
}

function computeUpdatedFeeAfterDelete(
  prev: StudentDetail,
  payment: { amount: number; status: string }
): FeeDeleteSuccess["updatedFee"] {
  if (!prev.fee || !isSuccessPaymentStatus(payment.status)) return null;
  const amt = Number(payment.amount) || 0;
  return {
    amountPaid: Math.max(0, Math.round((prev.fee.amountPaid - amt) * 100) / 100),
    remainingFee: Math.round((prev.fee.remainingFee + amt) * 100) / 100,
    finalFee: prev.fee.totalFee,
  };
}

function patchBreakdownAfterDeletePayment(
  prev: AdminStudentFeeBreakdownResult | null,
  updatedFee: FeeDeleteSuccess["updatedFee"],
  deletedAllocations?: Array<{ name: string; amount: number; key?: string }>
): AdminStudentFeeBreakdownResult | null {
  if (!updatedFee) return prev;
  const base = patchBreakdownAfterDelete(prev, updatedFee);
  if (!base || !deletedAllocations?.length) return base;

  const addByKey = new Map<string, number>();
  for (const line of deletedAllocations) {
    const key =
      typeof line.key === "string" && line.key.trim()
        ? normalizeBreakdownHeadKey(line.key)
        : "";
    if (!key) continue;
    addByKey.set(key, (addByKey.get(key) ?? 0) + (Number(line.amount) || 0));
  }
  if (addByKey.size === 0) return base;

  const dueHeads = base.dueHeads.map((h) => {
    const add = addByKey.get(normalizeBreakdownHeadKey(h.key)) ?? 0;
    if (add <= 0) return h;
    const dueBefore = Math.round((h.dueBefore + add) * 100) / 100;
    return { ...h, dueBefore };
  });

  return { ...base, dueHeads };
}

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
  const [transactionsReady, setTransactionsReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
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

  const mapListRow = useCallback(
    (s: {
      id: string;
      user?: { name?: string };
      admissionNumber?: string;
      fatherName?: string;
      parentName?: string;
      rollNo?: string | null;
      penNumber?: string | null;
      apaarId?: string | null;
      status?: string;
      application?: {
        firstName?: string | null;
        middleName?: string | null;
        lastName?: string | null;
      } | null;
      class?: { id: string; name: string; section: string | null };
    }): StudentOption => ({
      id: s.id,
      name: resolveStudentDisplayName({
        user: s.user,
        application: s.application,
        fatherName: s.fatherName,
        admissionNumber: s.admissionNumber,
      }),
      admissionNumber: s.admissionNumber ?? "",
      parentName: s.fatherName?.trim() || s.parentName?.trim() || "-",
      classDisplay: s.class ? `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}` : "-",
      classId: s.class?.id ?? "",
      section: s.class?.section ?? null,
      status: s.status ?? "Active",
      rollNo: s.rollNo ?? null,
      penNumber: s.penNumber ?? null,
      apaarId: s.apaarId ?? null,
    }),
    []
  );

  useEffect(() => {
    const cached = readStudentListCacheLegacy<StudentOption>();
    if (cached?.length) {
      setStudents(cached.map((s) => normalizeStudentOption(s)));
      setListLoading(false);
    }

    let cancelled = false;

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

        if (!cancelled) setListLoading(false);
      } catch {
        if (!cancelled && !cached?.length) setStudents([]);
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [studentIdFromUrl, mapListRow]);

  // Deep link (?studentId=…): follow the URL when it changes. Do NOT depend on `students` here — that
  // was resetting selection back to the URL id on every list refresh and overwrote the student's dropdown pick.
  useEffect(() => {
    if (studentIdFromUrl) {
      setSelectedId(studentIdFromUrl);
    }
  }, [studentIdFromUrl]);

  /** Deep link: fetch one row by id so the sidebar shows name/class immediately (not "Loading…"). */
  useEffect(() => {
    if (!studentIdFromUrl) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/student/list?search=1&studentId=${encodeURIComponent(studentIdFromUrl)}&take=1`,
          { credentials: "include", cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const row = Array.isArray(data?.students) ? data.students[0] : null;
        if (!row?.id || cancelled) return;
        const option = mapListRow(row);
        setStudents((prev) => {
          if (prev.some((s) => s.id === option.id)) {
            return prev.map((s) => (s.id === option.id ? { ...s, ...option } : s));
          }
          return [option, ...prev];
        });
        setDetail((prev) => {
          if (prev?.student.id === option.id && prev.student.name !== "Loading…") return prev;
          return buildPlaceholderDetail(normalizeStudentOption(option));
        });
      } catch {
        /* shell fetch will replace placeholder */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentIdFromUrl, mapListRow]);

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
    (student: StudentOption) => {
      setStudents((prev) => {
        if (prev.some((s) => s.id === student.id)) {
          return prev.map((s) => (s.id === student.id ? { ...s, ...student } : s));
        }
        return [student, ...prev];
      });
      setSelectedId(student.id);
      syncStudentIdInUrl(student.id);
    },
    [syncStudentIdInUrl]
  );

  const warmFeeBreakdown = useCallback(() => {
    if (!selectedId) return;
    const shellPaid = Number(detail?.fee?.amountPaid) || 0;
    const cached = getFeeBreakdownCached(selectedId);
    if (cached && cached.amountPaid + 0.02 >= shellPaid) {
      setFeeBreakdown(cached);
      setFeeBreakdownPending(false);
      return;
    }
    if (feeBreakdown && feeBreakdown.amountPaid + 0.02 >= shellPaid) return;
    void fetchFeeBreakdownFast(selectedId, {
      force: Boolean(cached && shellPaid > cached.amountPaid + 0.02),
      minAmountPaid: shellPaid,
    }).then((breakdown) => {
      if (breakdown) {
        setFeeBreakdown(breakdown);
        setFeeBreakdownPending(false);
      }
    });
  }, [selectedId, feeBreakdown, detail?.fee?.amountPaid]);

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

  const applyDetailsBundle = useCallback(
    (bundle: Awaited<ReturnType<typeof loadStudentDetailsBundle>>) => {
      const { feeBreakdown: breakdown, ...rest } = bundle;
      if (rest?.student) {
        const payments = (rest.payments ?? []).filter(
          (p) => !deletedPaymentIdsRef.current.has(p.id)
        );
        const shell =
          breakdown && rest.fee
            ? {
                ...rest,
                payments,
                fee: {
                  ...rest.fee,
                  // Breakdown is current-year source of truth. Do not Math.max with shell
                  // amountPaid — shell includes previous-year payments and inflates "paid".
                  amountPaid: Number(breakdown.amountPaid) || 0,
                  remainingFee: Number(breakdown.remainingFee) || 0,
                  totalFee: breakdown.totalAmount ?? rest.fee.totalFee,
                },
              }
            : { ...rest, payments };
        setDetail(shell);
        setFeeBreakdown(breakdown ?? null);
        if (breakdown && rest.student.id) setFeeBreakdownCache(rest.student.id, breakdown);
        setTransactionsReady(true);
      } else {
        setDetail(null);
        setFeeBreakdown(null);
        setTransactionsReady(false);
      }
    },
    []
  );

  const refreshFeesForStudent = useCallback(
    async (studentId: string, paymentResult?: FeePaymentSuccess) => {
      if (paymentResult) {
        setTransactionsReady(true);
        setDetail((prev) => {
          const next = patchDetailAfterPayment(prev, paymentResult);
          if (next?.student.id === studentId) {
            void refreshStudentFeesAfterMutation(studentId, {
              keepShell: next as unknown as StudentDetailsTabPayload,
              keepPatchedBreakdown: true,
              optimisticPendingId: paymentResult.payment.id.startsWith("pending-")
                ? paymentResult.payment.id
                : undefined,
              onPartial: (partial) => {
                if (partial.student?.id === studentId) applyDetailsBundle(partial);
              },
            });
          }
          return next;
        });
        setFeeBreakdown((prev) => {
          const next = patchBreakdownAfterPayment(prev, paymentResult) ?? prev;
          if (next) setFeeBreakdownCache(studentId, next);
          return next;
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
      deletedPaymentIdsRef.current.add(deleteResult.paymentId);
      invalidateStudentDetailsBundleCache(studentId);
      invalidateFeeBreakdownCache(studentId);

      setDetail((prev) => {
        const deletedPayment = prev?.payments.find((p) => p.id === deleteResult.paymentId);
        const updatedFee =
          deleteResult.updatedFee ??
          (prev && deletedPayment ? computeUpdatedFeeAfterDelete(prev, deletedPayment) : null);
        const fullResult: FeeDeleteSuccess = {
          ...deleteResult,
          updatedFee,
          feeAllocations:
            deleteResult.feeAllocations ??
            (deletedPayment as { feeAllocations?: FeeDeleteSuccess["feeAllocations"] })
              ?.feeAllocations,
        };
        const next = patchDetailAfterDelete(prev, fullResult);
        setFeeBreakdown((bdPrev) => {
          if (!fullResult.updatedFee) return bdPrev;
          const nextBd = patchBreakdownAfterDeletePayment(
            bdPrev,
            fullResult.updatedFee,
            fullResult.feeAllocations
          );
          if (nextBd) setFeeBreakdownCache(studentId, nextBd);
          return nextBd ?? bdPrev;
        });
        return next;
      });

      void fetchFeeBreakdownFast(studentId, { force: true }).then((bd) => {
        if (!bd) return;
        setFeeBreakdown(bd);
        setFeeBreakdownCache(studentId, bd);
      });
    },
    []
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
      setTransactionsReady(false);
      return;
    }

    let cancelled = false;

    const cachedBreakdown = getFeeBreakdownCached(selectedId);
    const cachedBundle = reloadKey === 0 ? peekStudentDetailsBundle(selectedId) : null;
    if (cachedBundle?.student) {
      applyDetailsBundle(cachedBundle);
    } else {
      setTransactionsReady(false);
      setDetail((prev) => {
        if (prev?.student.id === selectedId) return prev;
        const fromList = students.find((s) => s.id === selectedId);
        return fromList
          ? buildPlaceholderDetail(normalizeStudentOption(fromList))
          : buildPlaceholderById(selectedId);
      });
    }
    if (cachedBreakdown) {
      setFeeBreakdown(cachedBreakdown);
      setFeeBreakdownPending(false);
    } else {
      setFeeBreakdownPending(true);
    }

    loadStudentDetailsBundle(selectedId, {
      force: reloadKey > 0,
      onShellLoaded: (partial) => {
        if (cancelled) return;
        const { feeBreakdown: bd, ...rest } = partial;
        if (rest?.student) {
          setDetail((prev) => patchDetailShell(prev, rest as StudentDetail));
          setStudents((prev) => {
            const row = normalizeStudentOption({
              id: rest.student.id,
              name: rest.student.name,
              admissionNumber: rest.student.admissionNumber,
              fatherName: rest.student.fatherName,
              classDisplay: rest.student.class?.displayName,
              classId: rest.student.class?.id,
              section: rest.student.class?.section,
              status: rest.student.status,
            });
            if (prev.some((s) => s.id === rest.student.id)) {
              return prev.map((s) => (s.id === rest.student.id ? { ...s, ...row } : s));
            }
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
    if (!aside || !pageStudentName) {
      setShowStickyStudentName(false);
      return;
    }
    const scrollRoot = aside.closest("main");
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyStudentName(!entry.isIntersecting),
      scrollRoot
        ? { root: scrollRoot, threshold: 0, rootMargin: "-88px 0px 0px 0px" }
        : { threshold: 0, rootMargin: "-88px 0px 0px 0px" }
    );
    observer.observe(aside);
    return () => observer.disconnect();
  }, [pageStudentName, selectedId, detail?.student.id]);
  const classOptions = [{ label: "All Classes", value: "" }, ...classes.map((c) => ({ label: `${c.name}${c.section ? ` - ${c.section}` : ""}`, value: c.id }))];
  const statusOptions = [
    { label: "All Students", value: "all" },
    { label: "Active", value: "active" },
    { label: "Inactive", value: "inactive" },
  ];
  const sections = Array.from(new Set(classes.map((c) => c.section).filter(Boolean))) as string[];
  const sectionOptions = [{ label: "All Sections", value: "" }, ...sections.map((s) => ({ label: s, value: s }))];

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 w-full min-h-0 min-w-0 overflow-x-hidden pb-6 sm:pb-8">
      <PageHeader
        compact
        title="Student Details"
        subtitle="Search, view records, and manage fees."
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
      <div className="bg-white/5 backdrop-blur-xl border-b border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-6 overflow-visible relative z-20 isolate min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6 overflow-visible">
          <div className="relative z-20 min-w-0">
            <StudentSearchAutocomplete
              students={students}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelectStudent={selectStudent}
              selectedId={selectedId}
              classFilter={filterClass}
              sectionFilter={filterSection}
              statusFilter={filterStatus}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-2 block">Filter by Status</label>
            <SelectInput
              value={filterStatus}
              onChange={(v) => setFilterStatus(v as "all" | "active" | "inactive")}
              options={statusOptions}
              bgColor="black"
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
        <>
          {showStickyStudentName && pageStudentName ? (
            <div className="hidden xl:block fixed z-30 left-64 top-[5.5rem] w-[280px] 2xl:w-[300px] px-2 pointer-events-none">
              <StudentNameCard
                name={pageStudentName}
                meta={pageStudentMeta}
                className="pointer-events-auto bg-[#0a0f1a]/95 backdrop-blur-md shadow-lg border-white/15"
              />
            </div>
          ) : null}

          {showStickyStudentName && pageStudentName ? (
            <div className="xl:hidden sticky top-0 z-30 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 py-2 mb-2 bg-[#070b14]/95 backdrop-blur-md border-b border-white/10">
              <StudentNameCard name={pageStudentName} meta={pageStudentMeta} className="bg-transparent border-0 px-0 py-0" />
            </div>
          ) : null}

        <div className="min-w-0 w-full">
          {isSelectedInactive ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <span className="font-semibold text-red-100">Inactive student.</span>{" "}
              This student is inactive — you cannot record new fees, mark attendance, or use the student portal until they are set back to Active. Existing payments and transaction history are unchanged.
            </div>
          ) : null}

          <div className="flex flex-col xl:flex-row xl:flex-wrap gap-4 sm:gap-6 md:gap-8 min-w-0 w-full items-start">
            <aside
              ref={sidebarAsideRef}
              className="w-full xl:w-[280px] 2xl:w-[300px] shrink-0 min-w-0 relative z-10 xl:sticky xl:top-[5.5rem] xl:self-start"
            >
            <ProfileSidebar
              studentId={detail.student.id}
              feesRecordingDisabled={isSelectedInactive}
              student={{
                name: detail.student.name,
                id: detail.student.admissionNumber,
                className: detail.student.class?.displayName ?? "-",
                rollNo: detail.student.rollNo,
                age: String(detail.student.age ?? "-"),
                dob: detail.student.dob || "",
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
                  const sid = detail.student.id;
                  invalidateStudentDetailsBundleCache(sid);
                  clearStudentListCache();
                  if (patch.name !== undefined) {
                    setStudents((prev) => {
                      const next = prev.map((s) =>
                        s.id === sid ? { ...s, name: patch.name! } : s
                      );
                      writeStudentListCacheLegacy(next);
                      return next;
                    });
                  }
                  setDetail((current) => {
                    if (!current) return current;
                    const nextStudent = { ...current.student };
                    if (patch.fatherName !== undefined) nextStudent.fatherName = patch.fatherName;
                    if (patch.fatherPhone !== undefined) {
                      nextStudent.fatherPhone = patch.fatherPhone;
                      nextStudent.phone = patch.fatherPhone;
                    }
                    if (patch.motherName !== undefined) nextStudent.motherName = patch.motherName;
                    if (patch.motherPhone !== undefined) nextStudent.motherPhone = patch.motherPhone;
                    if (patch.name !== undefined) nextStudent.name = patch.name;
                    if (patch.email !== undefined) nextStudent.email = patch.email;
                    if (patch.phone !== undefined) nextStudent.phone = patch.phone;
                    if (patch.address !== undefined) nextStudent.address = patch.address;
                    if (patch.rollNo !== undefined) nextStudent.rollNo = patch.rollNo;
                    if (patch.gender !== undefined) nextStudent.gender = patch.gender;
                    if (patch.residencyType !== undefined) nextStudent.residencyType = patch.residencyType;
                    if (patch.dob !== undefined) nextStudent.dob = patch.dob;
                    if (patch.age !== undefined) {
                      const n = Number(patch.age);
                      nextStudent.age = Number.isFinite(n) ? n : nextStudent.age;
                    }
                    if (patch.classId !== undefined) {
                      if (patch.classId && patch.classDisplayName) {
                        const dash = patch.classDisplayName.indexOf(" - ");
                        nextStudent.class = {
                          id: patch.classId,
                          name: dash > 0 ? patch.classDisplayName.slice(0, dash) : patch.classDisplayName,
                          section: dash > 0 ? patch.classDisplayName.slice(dash + 3) : null,
                          displayName: patch.classDisplayName.replace(" - ", "-"),
                        };
                      } else {
                        nextStudent.class = null;
                      }
                    }
                    return { ...current, student: nextStudent };
                  });
                }
                setReloadKey((k) => k + 1);
              }}
              onOpenFees={() => {
                if (isSelectedInactive) return;
                warmFeeBreakdown();
                setFeesModalOpen(true);
              }}
              onFeesHover={warmFeeBreakdown}
            />
            </aside>

            <div className="flex-1 min-w-0 w-full xl:basis-[calc(100%-300px-2rem)] 2xl:basis-[calc(100%-320px-2rem)] space-y-4 sm:space-y-6 md:space-y-8">
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
                    {(() => {
                      const due =
                        feeBreakdown?.remainingFee ?? detail.fee?.remainingFee ?? 0;
                      return due > 0 ? `₹${due.toLocaleString()}` : "₹0";
                    })()}
                  </p>
                  <p className="text-[10px] text-lime-400">
                    {(feeBreakdown?.remainingFee ?? detail.fee?.remainingFee ?? 0) <= 0
                      ? "All Cleared"
                      : "Pending"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
              <AcademicPerformance data={detail.academicPerformance} />
              <AttendanceTrends data={detail.attendanceTrends} />
            </div>
            </div>

            <div className="w-full min-w-0 basis-full space-y-4 sm:space-y-6 md:space-y-8 relative z-0">
            {detail.fee ? (
              <FeesBreakdown
                studentId={detail.student.id}
                classId={detail.student.class?.id ?? null}
                feesRecordingDisabled={isSelectedInactive}
                totalFee={feeBreakdown?.totalAmount ?? detail.fee.totalFee}
                baseTotalFee={
                  feeBreakdown?.dueHeads?.length
                    ? Math.round(
                        feeBreakdown.dueHeads.reduce((s, h) => s + (Number(h.grossAmount) || 0), 0)
                      )
                    : detail.fee.baseTotalFee
                }
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
                latestDiscountApproval={detail.fee.discountApprovals?.[0] ?? null}
                discountApprovals={detail.fee.discountApprovals ?? []}
                onFeeModified={(paymentResult) => {
                  if (paymentResult?.payment.id) setAutoPrintPaymentId(paymentResult.payment.id);
                  if (detail.student.id) void refreshFeesForStudent(detail.student.id, paymentResult);
                }}
                residencyType={detail.student.residencyType ?? null}
                initialFeeBreakdown={feeBreakdown}
                feeBreakdownPending={feeBreakdownPending}
              />
            ) : null}

            <FeeTransactions
              fee={detail.fee}
              feeBreakdown={feeBreakdown}
              payments={detail.payments}
              transactionsLoading={!transactionsReady}
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
              feesRecordingDisabled={isSelectedInactive}
              autoPrintPaymentId={autoPrintPaymentId}
              onAutoPrintDone={() => setAutoPrintPaymentId(null)}
              onPaymentsChanged={() => {
                if (detail.student.id) void refreshFeesForStudent(detail.student.id);
              }}
              onPaymentDeleted={(result) => {
                if (detail.student.id) removePaymentForStudent(detail.student.id, result);
              }}
            />

            <Certificates certificates={detail.certificates} />
            </div>
          </div>
        </div>
        </>
      )}

      {!detail && selectedId && !listLoading && (
        <div className="text-center py-12 text-gray-400">Student not found.</div>
      )}

      {feesModalOpen && detail && !isSelectedInactive ? (
        <StudentFeesPaymentModal
          studentId={detail.student.id}
          studentName={detail.student.name}
          initialFeeBreakdown={feeBreakdown ?? getFeeBreakdownCached(detail.student.id)}
          breakdownPending={feeBreakdownPending}
          onClose={() => setFeesModalOpen(false)}
          onSuccess={(result) => {
            setFeesModalOpen(false);
            if (result.payment.id) setAutoPrintPaymentId(result.payment.id);
            void refreshFeesForStudent(detail.student.id, result);
          }}
          onPaymentFailed={(message) => {
            alert(message);
            void refreshFeesForStudent(detail.student.id);
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
  onPaymentFailed,
}: {
  studentId: string;
  studentName: string;
  initialFeeBreakdown?: AdminStudentFeeBreakdownResult | null;
  breakdownPending?: boolean;
  onClose: () => void;
  onSuccess: (result: FeePaymentSuccess) => void;
  onPaymentFailed?: (message: string) => void;
}) {
  const { data: session } = useSession();
  const collectorName =
    (session?.user?.name || session?.user?.email || "").trim() || "Staff";
  const collectorUserId = session?.user?.id ?? null;

  const seedRows = dueHeadRowsFromBreakdown(
    initialFeeBreakdown ?? getFeeBreakdownCached(studentId)
  ).filter((r) => !isPreviousYearFeeHeadName(r.label));
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
          setRows(
            dueHeadRowsFromBreakdown(data).filter((r) => !isPreviousYearFeeHeadName(r.label))
          );
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
        const sourceKey = normalizeFeeAllocationKey(r.sourceKey || r.key);
        if (sourceKey.startsWith("BASE:")) {
          const idx = Number(sourceKey.slice("BASE:".length));
          if (!Number.isFinite(idx)) return null;
          return {
            headType: "BASE_COMPONENT" as const,
            componentIndex: idx,
            componentName: r.label,
          };
        }
        const extraFeeId = extraFeeIdFromAllocationKey(sourceKey);
        if (extraFeeId) {
          return {
            headType: "EXTRA_FEE" as const,
            extraFeeId,
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
            key: normalizeFeeAllocationKey(r.sourceKey || r.key),
            amount: Number(r.payAmount),
            label: r.label,
          })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Payment failed");
      }
      if (data.idempotent === true) {
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : "This UTR / reference was already recorded for these fee heads."
        );
      }
      const confirmedResult = buildConfirmedPaymentResult(
        data,
        total,
        mode,
        paymentDate,
        referenceNo,
        selectedRows,
        initialFeeBreakdown ?? getFeeBreakdownCached(studentId),
        {
          collectedByName: collectorName,
          collectedByUserId: collectorUserId,
        }
      );
      onSuccess(confirmedResult);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Payment failed";
      onPaymentFailed?.(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-7xl rounded-2xl border border-white/10 bg-[#0B1220] p-4 sm:p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white">Fees Sheet — {studentName}</h4>
            <p className="text-xs text-white/60 mt-1">Enter amount per head like a spreadsheet, then submit payment.</p>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {rows.length === 0 && loading ? (
          <div className="py-10 text-center text-white/70"><Spinner /></div>
        ) : (
          <>
            <div className="max-h-[min(360px,50vh)] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-white/70 sticky top-0 z-[1]">
                  <tr>
                    <th className="px-3 py-2 min-w-[10rem]">Fee Type</th>
                    <th className="px-2 py-2 whitespace-nowrap text-right w-[6.5rem]">Total</th>
                    <th className="px-2 py-2 whitespace-nowrap text-right w-[6rem]">Discount</th>
                    <th className="px-2 py-2 whitespace-nowrap text-right w-[6rem]">Paid</th>
                    <th className="px-2 py-2 whitespace-nowrap text-right w-[6rem]">Balance</th>
                    <th className="w-11 px-1 py-2 text-center" title="Pay full balance for this head">
                      All
                    </th>
                    <th className="px-2 py-2 whitespace-nowrap w-[7.5rem]">Record Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-white/5">
                      <td className="px-3 py-2 text-white align-top leading-snug break-words">{r.label}</td>
                      <td className="px-2 py-2 text-white whitespace-nowrap text-right align-top">₹{Math.round(r.totalAmount).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-2 text-cyan-300 whitespace-nowrap text-right align-top">₹{Math.round(r.discountAmount).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-2 text-lime-300 whitespace-nowrap text-right align-top">₹{Math.round(r.paidAmount).toLocaleString("en-IN")}</td>
                      <td className="px-2 py-2 text-amber-300 whitespace-nowrap text-right align-top">₹{Math.round(r.dueBefore).toLocaleString("en-IN")}</td>
                      <td className="px-1 py-2 text-center align-top">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-lime-400 disabled:cursor-not-allowed disabled:opacity-40"
                          checked={r.payEntireHead}
                          disabled={r.dueBefore <= 0}
                          onChange={(e) => togglePayEntireHead(r.key, e.target.checked)}
                          aria-label={`Pay full balance for ${r.label}`}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={r.payAmount}
                          onChange={(e) => setRowAmount(r.key, e.target.value)}
                          className="w-full min-w-[5.5rem] rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-white"
                          placeholder="0.00"
                          aria-label={`Record fee for ${r.label}`}
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/10 bg-white/5 font-semibold">
                    <td className="px-3 py-2 text-white">Total</td>
                    <td className="px-2 py-2 text-white whitespace-nowrap text-right">₹{Math.round(totals.totalAmount).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2 text-cyan-300 whitespace-nowrap text-right">₹{Math.round(totals.discountAmount).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2 text-lime-300 whitespace-nowrap text-right">₹{Math.round(totals.paidAmount).toLocaleString("en-IN")}</td>
                    <td className="px-2 py-2 text-amber-300 whitespace-nowrap text-right">₹{Math.round(totals.balance).toLocaleString("en-IN")}</td>
                    <td className="px-1 py-2" />
                    <td className="px-2 py-2 text-blue-300 whitespace-nowrap">₹{total.toLocaleString("en-IN")}</td>
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
