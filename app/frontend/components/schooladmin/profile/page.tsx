"use client";

import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AcademicPerformance } from "./components/AcademicPerformance";
import { FeeTransactions } from "./components/FeeTransactions";
import { FeesBreakdown } from "./components/FeesBreakdown";
import { ProfileSidebar } from "./components/ProfileSidebar";
import { AttendanceTrends } from "./components/AttendanceTrends";
import { Certificates } from "./components/Certificates";
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

function StudentDetailsPageContent() {
  const searchParams = useSearchParams();
  const studentIdFromUrl = searchParams.get("studentId");
  const focusFromUrl = searchParams.get("focus");

  const [students, setStudents] = useState<StudentOption[]>([]);
  /** Seed from URL so `/api/student/:id` runs immediately instead of waiting for the full student list. */
  const [selectedId, setSelectedId] = useState<string | null>(studentIdFromUrl);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [classes, setClasses] = useState<{ id: string; name: string; section: string | null }[]>([]);
  const [bulkExtraFeeOpen, setBulkExtraFeeOpen] = useState(false);
  const [feesModalOpen, setFeesModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [studentsRes, classesRes] = await Promise.all([
          fetch("/api/student/list", { credentials: "include" }),
          fetch("/api/class/list", { credentials: "include" }),
        ]);
        if (!cancelled && studentsRes.ok) {
          const d = await studentsRes.json();
          const list: StudentOption[] = (d.students || []).map((s: { id: string; user?: { name?: string }; admissionNumber?: string; fatherName?: string; parentName?: string; class?: { id: string; name: string; section: string | null } }) => ({
            id: s.id,
            name: s.user?.name ?? "Unknown",
            admissionNumber: s.admissionNumber ?? "",
            parentName: s.fatherName?.trim() || s.parentName?.trim() || "-",
            classDisplay: s.class ? `${s.class.name}${s.class.section ? `-${s.class.section}` : ""}` : "-",
            classId: s.class?.id ?? "",
            section: s.class?.section ?? null,
          }));
          setStudents(list);
        }
        if (!cancelled && classesRes.ok) {
          const c = await classesRes.json();
          setClasses(c.classes ?? []);
        }
      } catch {
        if (!cancelled) setStudents([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (students.length === 0) return;
    if (studentIdFromUrl && students.some((s) => s.id === studentIdFromUrl)) {
      setSelectedId(studentIdFromUrl);
      return;
    }
    if (studentIdFromUrl) {
      setSelectedId(students[0].id);
      return;
    }
    setSelectedId((prev) => (prev && students.some((s) => s.id === prev) ? prev : students[0].id));
  }, [students, studentIdFromUrl]);

  useLayoutEffect(() => {
    if (loading || !detail || focusFromUrl !== "fees") return;
    document.getElementById("student-profile-fees-section")?.scrollIntoView({
      behavior: "instant",
      block: "start",
    });
  }, [loading, detail, focusFromUrl]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/student/${selectedId}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.message || "Failed to load student");
        return d;
      })
      .then((d) => {
        if (!cancelled && d?.student) {
          setDetail(d);
        } else {
          setDetail(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail(null);
          console.error("Student details error:", err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedId, reloadKey]);

  const filtered = students.filter((s) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.admissionNumber.toLowerCase().includes(q)) return false;
    }
    if (filterClass && s.classId !== filterClass) return false;
    if (filterSection && s.section !== filterSection) return false;
    return true;
  });

  const selectedOption = filtered.find((s) => s.id === selectedId) ?? filtered[0];
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
              onSelectStudent={setSelectedId}
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
              onChange={(value) => setSelectedId(value || null)}
              options={[
                { label: "Select student", value: "" },
                ...filtered.map((s) => ({
                  label: `${s.name} -${s.admissionNumber || "-"} | ${s.classDisplay || "-"} | ${s.parentName || "-"}`,
                  value: s.id,
                })),
              ]}
              bgColor="black"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-400"><Spinner /></div>
      )}

      {!loading && detail && (
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
              onSaved={() => setReloadKey((k) => k + 1)}
              onOpenFees={() => setFeesModalOpen(true)}
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
              onPaymentsChanged={() => setReloadKey((k) => k + 1)}
            />

            {detail.fee && (
              <>
                <FeesBreakdown
                  studentId={detail.student.id}
                  totalFee={detail.fee.totalFee}
                  baseTotalFee={detail.fee.baseTotalFee}
                  discountPercent={detail.fee.discountPercent}
                  amountPaid={detail.fee.amountPaid}
                  remainingFee={detail.fee.remainingFee}
                  payments={detail.payments}
                  studentName={detail.student.name}
                  admissionNumber={detail.student.admissionNumber}
                  classDisplayName={detail.student.class?.displayName ?? "-"}
                  schoolName={detail.student.schoolName}
                  discountFeeHeadKey={detail.fee.discountFeeHeadKey}
                  discountFeeHeadLabel={detail.fee.discountFeeHeadLabel}
                  discountRemarks={detail.fee.discountRemarks}
                  onFeeModified={() => setReloadKey(prev => prev + 1)}
                />
              </>
            )}

            <div className="mt-8">
              <Certificates certificates={detail.certificates} />
            </div>
          </div>
        </div>
      )}

      {!loading && !detail && selectedId && (
        <div className="text-center py-12 text-gray-400">Student not found.</div>
      )}

      {feesModalOpen && detail ? (
        <StudentFeesPaymentModal
          studentId={detail.student.id}
          studentName={detail.student.name}
          onClose={() => setFeesModalOpen(false)}
          onSuccess={() => {
            setFeesModalOpen(false);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}

      {!loading && !selectedId && students.length === 0 && (
        <div className="text-center py-12 text-gray-400">No students found.</div>
      )}
    </div>
  );
}

type DueHeadRow = {
  key: string;
  sourceKey?: string;
  label: string;
  totalAmount: number;
  paidAmount: number;
  discountAmount: number;
  dueBefore: number;
  payAmount: string;
};

function StudentFeesPaymentModal({
  studentId,
  studentName,
  onClose,
  onSuccess,
}: {
  studentId: string;
  studentName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [rows, setRows] = useState<DueHeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [mode, setMode] = useState<"CASH" | "ONLINE" | "CHEQUE" | "DD" | "OTHERS">("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const splitHostelIntoInstallments = (rowsIn: DueHeadRow[]): DueHeadRow[] => {
    const out: DueHeadRow[] = [];
    for (const r of rowsIn) {
      const isHostel = (r.label || "").trim().toLowerCase() === "hostel fee";
      if (!isHostel) {
        out.push(r);
        continue;
      }
      const total = Number(r.totalAmount) || 0;
      const paidTotal = Math.max(Number(r.paidAmount) || 0, 0);
      const firstAmount = Math.round((total / 2) * 100) / 100;
      const secondAmount = Math.round((total - firstAmount) * 100) / 100;

      const firstPaid = Math.min(paidTotal, firstAmount);
      const secondPaid = Math.min(Math.max(paidTotal - firstAmount, 0), secondAmount);
      const firstDue = Math.max(firstAmount - firstPaid, 0);
      const secondDue = Math.max(secondAmount - secondPaid, 0);

      out.push({
        ...r,
        key: `${r.key}::INST1`,
        sourceKey: r.key,
        label: `${r.label} (1st Installment)`,
        totalAmount: firstAmount,
        paidAmount: firstPaid,
        dueBefore: firstDue,
      });
      out.push({
        ...r,
        key: `${r.key}::INST2`,
        sourceKey: r.key,
        label: `${r.label} (2nd Installment)`,
        totalAmount: secondAmount,
        paidAmount: secondPaid,
        dueBefore: secondDue,
      });
    }
    return out;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/fees/admin/breakdown?studentId=${encodeURIComponent(studentId)}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || "Failed to load fee heads");
        }
        const dueHeads = Array.isArray(data?.dueHeads) ? data.dueHeads : [];
        if (!cancelled) {
          const mappedRows = dueHeads.map((h: { key: string; label: string; dueBefore: number; snapshotAmount?: number }) => ({
              key: h.key,
              label: h.label || "Fee Head",
              totalAmount: Number(h.snapshotAmount) || 0,
              paidAmount: Math.max((Number(h.snapshotAmount) || 0) - (Number(h.dueBefore) || 0), 0),
              discountAmount: 0,
              dueBefore: Number(h.dueBefore) || 0,
              payAmount: "",
            }));
          setRows(splitHostelIntoInstallments(mappedRows));
              setPaymentDate(new Date().toISOString().slice(0, 10));
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
  }, [studentId]);

  const setRowAmount = (key: string, value: string) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, payAmount: value } : r)));
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
          explicitAllocations: selectedRows.map((r) => ({ key: r.sourceKey || r.key, amount: Number(r.payAmount) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Payment failed");
      }
      onSuccess();
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

        {loading ? (
          <div className="py-10 text-center text-white/70"><Spinner /></div>
        ) : (
          <>
            <div className="max-h-[360px] overflow-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-white/5 text-left text-white/70">
                  <tr>
                    <th className="px-3 py-2">Fee Type</th>
                    <th className="px-3 py-2">Total Amount</th>
                    <th className="px-3 py-2">Discount</th>
                    <th className="px-3 py-2">Paid Amount</th>
                    <th className="px-3 py-2">Balance</th>
                    <th className="px-3 py-2">Record Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t border-white/5">
                      <td className="px-3 py-2 text-white">{r.label}</td>
                      <td className="px-3 py-2 text-white">₹{r.totalAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-cyan-300">₹{r.discountAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-lime-300">₹{r.paidAmount.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2 text-amber-300">₹{r.dueBefore.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={r.dueBefore}
                          step="0.01"
                          value={r.payAmount}
                          onChange={(e) => setRowAmount(r.key, e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                          placeholder="0.00"
                        />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/10 bg-white/5 font-semibold">
                    <td className="px-3 py-2 text-white">Total</td>
                    <td className="px-3 py-2 text-white">₹{totals.totalAmount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-cyan-300">₹{totals.discountAmount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-lime-300">₹{totals.paidAmount.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2 text-amber-300">₹{totals.balance.toLocaleString("en-IN")}</td>
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
