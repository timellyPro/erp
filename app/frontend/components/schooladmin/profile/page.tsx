"use client";

import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AcademicPerformance } from "./components/AcademicPerformance";
import { FeeTransactions } from "./components/FeeTransactions";
import { FeesBreakdown } from "./components/FeesBreakdown";
import { OfflinePayments } from "./components/OfflinePayments";
import { ProfileSidebar } from "./components/ProfileSidebar";
import { AttendanceTrends } from "./components/AttendanceTrends";
import { Certificates } from "./components/Certificates";
import { StudentSearchAutocomplete } from "./components/StudentSearchAutocomplete";
import { Calendar, BookOpen, Activity, Clock, FileSpreadsheet } from "lucide-react";
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
    fatherOccupation?: string;
    motherOccupation?: string;
    fatherPhone?: string;
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
              fatherOccupation={detail.student.fatherOccupation}
              fatherPhone={detail.student.fatherPhone}
              motherName={detail.student.motherName}
              motherOccupation={detail.student.motherOccupation}
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
                  onFeeModified={() => setReloadKey(prev => prev + 1)}
                />
                <OfflinePayments
                  studentId={detail.student.id}
                  studentName={detail.student.name}
                  remainingFee={detail.fee.remainingFee}
                  onPaymentAdded={() => setReloadKey(prev => prev + 1)}
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

      {!loading && !selectedId && students.length === 0 && (
        <div className="text-center py-12 text-gray-400">No students found.</div>
      )}
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
