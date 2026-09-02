"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { SelectField } from "./MarksSelectField";
import {
  Download,
  Printer,
  Search,
  BookOpen,
  TrendingUp,
  Award,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  loadTeacherMarksClasses,
  peekTeacherMarksClasses,
  type LiteClassOption,
} from "@/lib/loadTeacherFastTabs";
import MarksReportTemplate, {
  type MarksReportData,
} from "@/app/frontend/components/pdf/MarksReportTemplate";
import { generatePDF, waitForPdfMountReady } from "@/lib/pdfUtils";
import { resolveSchoolLogoFetchUrl } from "@/lib/feeDayReportExcel";

type ClassOption = { id: string; name: string; section: string | null };
type StudentOption = { id: string; name: string; rollNo: string | null };

type MarkRow = {
  subject: string;
  marks: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  examType: string | null;
};

type ReportCardData = {
  student: {
    name: string;
    class: string;
    admissionNumber: string;
    rollNo: string | null;
    fatherName: string;
  };
  school: {
    name: string;
    address: string;
    logoUrl: string | null;
  };
  marks: MarkRow[];
  summary: {
    totalObtained: number;
    totalMax: number;
    overallPercentage: number;
    overallGrade: string;
    totalSubjects: number;
  };
};

function mapLiteClasses(list: LiteClassOption[]): ClassOption[] {
  return list.map((c) => ({ id: c.id, name: c.name, section: c.section ?? null }));
}

const DEFAULT_EXAM_TYPES = ["ALL", "TERM 1", "TERM 2", "FINAL"];

function GradeIndicator({ grade }: { grade: string }) {
  const colorMap: Record<string, string> = {
    "A+": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    A: "bg-green-500/20 text-green-400 border-green-500/30",
    "B+": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    B: "bg-sky-500/20 text-sky-400 border-sky-500/30",
    C: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    D: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    F: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const cls = colorMap[grade] ?? "bg-white/10 text-white/60 border-white/20";
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${cls}`}>
      {grade}
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 flex items-center gap-4">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent ?? "bg-lime-400/10"}`}
      >
        <Icon size={20} className={accent ? "text-white" : "text-lime-400"} />
      </div>
      <div>
        <p className="text-xs text-white/50 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-white">{value}</p>
        {sub ? <p className="text-[11px] text-white/40">{sub}</p> : null}
      </div>
    </div>
  );
}

export default function TeacherReportCard({
  scope = "teacher",
}: {
  /** teacher = assigned classes only; school = all school classes */
  scope?: "teacher" | "school";
}) {
  const initialClasses = scope === "teacher" ? peekTeacherMarksClasses() : null;
  const [classes, setClasses] = useState<ClassOption[]>(() =>
    initialClasses ? mapLiteClasses(initialClasses) : []
  );
  const [classesLoading, setClassesLoading] = useState(() => !initialClasses);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [examTypeOptions, setExamTypeOptions] = useState<string[]>(DEFAULT_EXAM_TYPES);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedClassId, setSelectedClassId] = useState(() => initialClasses?.[0]?.id ?? "");
  const [selectedClassLabel, setSelectedClassLabel] = useState(() => {
    const first = initialClasses?.[0];
    return first ? (first.section ? `${first.name} - ${first.section}` : first.name) : "";
  });
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedExamType, setSelectedExamType] = useState("ALL");

  const [reportData, setReportData] = useState<ReportCardData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  const pdfRef = useRef<HTMLDivElement>(null);

  const classOptions = classes.map((c) => ({
    value: c.id,
    label: c.section ? `${c.name} - ${c.section}` : c.name,
  }));

  useEffect(() => {
    (async () => {
      if (scope === "school") {
        setClassesLoading(true);
        try {
          const res = await fetch("/api/class/list?lite=1", {
            credentials: "include",
            cache: "no-store",
          });
          const data = await res.json().catch(() => ({}));
          const list = Array.isArray(data.classes) ? data.classes : [];
          const mapped = mapLiteClasses(list);
          setClasses(mapped);
          if (!selectedClassId && mapped[0]) {
            setSelectedClassId(mapped[0].id);
            setSelectedClassLabel(
              mapped[0].section
                ? `${mapped[0].name} - ${mapped[0].section}`
                : mapped[0].name
            );
          }
        } catch {
          setClasses([]);
        } finally {
          setClassesLoading(false);
        }
        return;
      }

      const cached = peekTeacherMarksClasses();
      if (cached?.length) {
        setClasses(mapLiteClasses(cached));
        setClassesLoading(false);
        if (!selectedClassId && cached[0]) {
          setSelectedClassId(cached[0].id);
          setSelectedClassLabel(
            cached[0].section ? `${cached[0].name} - ${cached[0].section}` : cached[0].name
          );
        }
      } else {
        setClassesLoading(true);
      }
      try {
        const list = await loadTeacherMarksClasses({ revalidate: true });
        setClasses(mapLiteClasses(list));
        if (!selectedClassId && list[0]) {
          setSelectedClassId(list[0].id);
          setSelectedClassLabel(
            list[0].section ? `${list[0].name} - ${list[0].section}` : list[0].name
          );
        }
      } catch {
        /* noop */
      } finally {
        setClassesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/exam-types", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const names: string[] = Array.isArray(data.examTypes) ? data.examTypes : [];
        if (names.length > 0) {
          setExamTypeOptions(["ALL", ...names]);
        }
      } catch {
        /* noop */
      }
    })();
  }, []);

  const fetchStudents = useCallback(async () => {
    if (!selectedClassId) {
      setStudents([]);
      return;
    }
    setStudentsLoading(true);
    try {
      const res = await fetch(
        `/api/class/students?classId=${encodeURIComponent(selectedClassId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const list: StudentOption[] = (
        Array.isArray(data.students) ? data.students : []
      ).map(
        (s: {
          id: string;
          rollNo: string | null;
          user: { name: string | null };
        }) => ({
          id: s.id,
          name: s.user?.name ?? "Student",
          rollNo: s.rollNo,
        })
      );
      setStudents(list);
      setSelectedStudentId("");
      setReportData(null);
    } catch {
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.rollNo && s.rollNo.toLowerCase().includes(q))
    );
  }, [students, searchQuery]);

  const fetchReport = useCallback(async () => {
    if (!selectedStudentId || !selectedClassId) return;
    setReportLoading(true);
    try {
      const params = new URLSearchParams({
        studentId: selectedStudentId,
        classId: selectedClassId,
      });
      if (selectedExamType && selectedExamType !== "ALL") {
        params.set("examType", selectedExamType);
      }
      const res = await fetch(`/api/marks/report-card?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setReportData(null);
        return;
      }
      const data: ReportCardData = await res.json();
      setReportData(data);
    } catch {
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  }, [selectedStudentId, selectedClassId, selectedExamType]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const pdfData: MarksReportData | null = reportData
    ? {
        schoolName: reportData.school.name,
        schoolLogo: resolveSchoolLogoFetchUrl(reportData.school.logoUrl),
        schoolAddress: reportData.school.address,
        studentName: reportData.student.name,
        studentClass: reportData.student.class,
        admissionNumber: reportData.student.admissionNumber,
        dateGenerated: new Date(),
        overallScore: reportData.summary.overallPercentage,
        overallGrade: reportData.summary.overallGrade,
        totalMarks: reportData.summary.totalObtained,
        totalMaxMarks: reportData.summary.totalMax,
        marks: reportData.marks.map((m) => ({
          subject: m.subject,
          marks: m.marks,
          totalMarks: m.totalMarks,
          grade: m.grade,
          examType: m.examType,
        })),
      }
    : null;

  const displaySchoolLogo = reportData?.school?.logoUrl
    ? resolveSchoolLogoFetchUrl(reportData.school.logoUrl)
    : null;

  const handleDownloadPdf = async () => {
    if (!pdfData) return;
    setPdfLoading(true);
    try {
      await waitForPdfMountReady(pdfRef, 200);
      const fileName = `Report-Card-${reportData!.student.name.replace(/\s+/g, "-")}-${selectedExamType}.pdf`;
      await generatePDF(pdfRef, fileName);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!pdfData) return;
    setPdfLoading(true);
    try {
      const { printFromElement } = await import("@/lib/pdfUtils");
      await printFromElement(pdfRef, { minHeight: 200 });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to print");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleClassChange = (v: string) => {
    const opt = classOptions.find((o) => o.label === v);
    if (opt) {
      setSelectedClassId(opt.value);
      setSelectedClassLabel(opt.label);
    }
  };

  const handleStudentSelect = (id: string) => {
    setSelectedStudentId(id);
  };

  return (
    <div className="space-y-6">
      {/* FILTER BAR */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SelectField
            label="CLASS"
            value={selectedClassLabel}
            onChange={handleClassChange}
            options={
              classOptions.length
                ? classOptions.map((o) => o.label)
                : ["Select class"]
            }
            className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
          />
          <SelectField
            label="EXAM TYPE"
            value={selectedExamType}
            onChange={setSelectedExamType}
            options={examTypeOptions}
            className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm"
          />
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1.5 uppercase tracking-widest">
              SEARCH STUDENT
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
              />
              <input
                type="text"
                placeholder="Name or Roll No..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl focus:outline-none focus:border-lime-400/50 text-white text-sm placeholder:text-white/30"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* STUDENT LIST */}
        <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
          <div className="p-4 border-b border-white/10 bg-white/[0.02]">
            <h3 className="font-bold text-white text-sm">
              Students{" "}
              <span className="text-white/40 font-normal">
                ({filteredStudents.length})
              </span>
            </h3>
          </div>
          <div className="max-h-[500px] overflow-y-auto divide-y divide-white/5">
            {classesLoading || studentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
              </div>
            ) : filteredStudents.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">
                {students.length === 0
                  ? "No students found"
                  : "No matching students"}
              </p>
            ) : (
              filteredStudents.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleStudentSelect(s.id)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-all hover:bg-white/5 ${
                    selectedStudentId === s.id
                      ? "bg-lime-400/10 border-l-2 border-lime-400"
                      : "border-l-2 border-transparent"
                  }`}
                >
                  <img
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&size=36&background=4ade80&color=fff`}
                    alt={s.name}
                    className="w-9 h-9 rounded-full flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {s.name}
                    </p>
                    <p className="text-xs text-white/40">
                      Roll: {s.rollNo ?? "—"}
                    </p>
                  </div>
                  {selectedStudentId === s.id && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-lime-400 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* REPORT CARD */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedStudentId ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 flex flex-col items-center justify-center text-center">
              <BookOpen size={48} className="text-white/20 mb-4" />
              <h3 className="text-lg font-semibold text-white/60">
                Select a Student
              </h3>
              <p className="text-sm text-white/30 mt-1 max-w-sm">
                Choose a student from the list to view their report card
              </p>
            </div>
          ) : reportLoading ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
            </div>
          ) : !reportData || reportData.marks.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-12 flex flex-col items-center justify-center text-center">
              <Award size={48} className="text-white/20 mb-4" />
              <h3 className="text-lg font-semibold text-white/60">
                No Marks Found
              </h3>
              <p className="text-sm text-white/30 mt-1 max-w-sm">
                No marks have been entered for this student yet
              </p>
            </div>
          ) : (
            <>
              {/* Student Header */}
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-lime-400/5 via-white/5 to-emerald-400/5 backdrop-blur-xl p-5">
                {displaySchoolLogo ? (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <img
                      src={displaySchoolLogo}
                      alt=""
                      className="w-52 h-52 object-contain opacity-[0.05]"
                    />
                  </div>
                ) : null}
                <div className="relative z-10 flex items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-3 min-w-0">
                    {displaySchoolLogo ? (
                      <img
                        src={displaySchoolLogo}
                        alt={`${reportData.school.name} logo`}
                        className="w-11 h-11 rounded-full object-cover border border-white/15 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full border border-white/15 text-[10px] font-semibold text-white/70 grid place-items-center shrink-0">
                        LOGO
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {reportData.school.name || "School"}
                      </p>
                      <p className="text-[11px] text-white/45 truncate">
                        {reportData.school.address || "-"}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] uppercase tracking-wider text-white/40">
                    Academic Performance Report
                  </span>
                </div>
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(reportData.student.name)}&size=56&background=4ade80&color=fff`}
                      alt={reportData.student.name}
                      className="w-14 h-14 rounded-full flex-shrink-0"
                    />
                    <div>
                      <h2 className="text-lg font-bold text-white">
                        {reportData.student.name}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50 mt-0.5">
                        <span>{reportData.student.class}</span>
                        <span className="w-1 h-1 rounded-full bg-white/30" />
                        <span>{reportData.student.admissionNumber}</span>
                        {reportData.student.rollNo && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-white/30" />
                            <span>Roll: {reportData.student.rollNo}</span>
                          </>
                        )}
                      </div>
                      {reportData.student.fatherName && (
                        <p className="text-xs text-white/40 mt-0.5">
                          Father: {reportData.student.fatherName}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={handleDownloadPdf}
                      disabled={pdfLoading}
                      className="px-4 py-2 rounded-xl bg-lime-400/10 text-lime-400 border border-lime-400/20 text-sm font-medium flex items-center gap-2 hover:bg-lime-400/20 transition disabled:opacity-50"
                    >
                      <Download size={14} />
                      {pdfLoading ? "Generating…" : "Download PDF"}
                    </button>
                    <button
                      onClick={handlePrint}
                      disabled={pdfLoading}
                      className="px-4 py-2 rounded-xl bg-white/5 text-white/70 border border-white/10 text-sm font-medium flex items-center gap-2 hover:bg-white/10 transition disabled:opacity-50"
                    >
                      <Printer size={14} />
                      Print
                    </button>
                  </div>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard
                  icon={TrendingUp}
                  label="Overall %"
                  value={`${reportData.summary.overallPercentage}%`}
                />
                <StatCard
                  icon={Award}
                  label="Grade"
                  value={reportData.summary.overallGrade}
                />
                <StatCard
                  icon={BookOpen}
                  label="Subjects"
                  value={reportData.summary.totalSubjects}
                  sub={`${reportData.summary.totalObtained}/${reportData.summary.totalMax}`}
                />
              </div>

              {/* Marks Table */}
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
                <div className="p-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm">
                    Subject-wise Performance
                  </h3>
                  <span className="text-xs text-lime-400 font-medium">
                    {selectedExamType === "ALL" ? "All Exams" : selectedExamType}
                  </span>
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-white/40 uppercase tracking-wider border-b border-white/5">
                        <th className="text-left px-5 py-3">Subject</th>
                        <th className="text-center px-3 py-3">Obtained</th>
                        <th className="text-center px-3 py-3">Total</th>
                        <th className="text-center px-3 py-3">Percentage</th>
                        <th className="text-center px-3 py-3">Grade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {reportData.marks.map((m, idx) => (
                        <tr
                          key={`${m.subject}-${m.examType}-${idx}`}
                          className="hover:bg-white/[0.03] transition"
                        >
                          <td className="px-5 py-3">
                            <div className="font-medium text-white">
                              {m.subject}
                            </div>
                            {m.examType && (
                              <div className="text-[11px] text-white/30">
                                {m.examType}
                              </div>
                            )}
                          </td>
                          <td className="text-center px-3 py-3 font-semibold text-white">
                            {m.marks}
                          </td>
                          <td className="text-center px-3 py-3 text-white/60">
                            {m.totalMarks}
                          </td>
                          <td className="text-center px-3 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-lime-400"
                                  style={{
                                    width: `${Math.min(100, m.percentage)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-white font-medium text-xs w-12">
                                {m.percentage}%
                              </span>
                            </div>
                          </td>
                          <td className="text-center px-3 py-3">
                            <GradeIndicator grade={m.grade} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/[0.02]">
                        <td className="px-5 py-3 font-bold text-white uppercase text-xs">
                          Total
                        </td>
                        <td className="text-center px-3 py-3 font-bold text-white">
                          {reportData.summary.totalObtained}
                        </td>
                        <td className="text-center px-3 py-3 font-bold text-white/60">
                          {reportData.summary.totalMax}
                        </td>
                        <td className="text-center px-3 py-3 font-bold text-lime-400">
                          {reportData.summary.overallPercentage}%
                        </td>
                        <td className="text-center px-3 py-3">
                          <GradeIndicator
                            grade={reportData.summary.overallGrade}
                          />
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden p-4 space-y-3">
                  {reportData.marks.map((m, idx) => (
                    <button
                      key={`${m.subject}-${m.examType}-${idx}`}
                      onClick={() =>
                        setExpandedSubject(
                          expandedSubject === `${m.subject}-${idx}`
                            ? null
                            : `${m.subject}-${idx}`
                        )
                      }
                      className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-white text-sm">
                            {m.subject}
                          </p>
                          {m.examType && (
                            <p className="text-[11px] text-white/30">
                              {m.examType}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <GradeIndicator grade={m.grade} />
                          {expandedSubject === `${m.subject}-${idx}` ? (
                            <ChevronUp size={14} className="text-white/30" />
                          ) : (
                            <ChevronDown size={14} className="text-white/30" />
                          )}
                        </div>
                      </div>
                      {expandedSubject === `${m.subject}-${idx}` && (
                        <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-white/40 uppercase">
                              Obtained
                            </p>
                            <p className="font-bold text-white">{m.marks}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-white/40 uppercase">
                              Total
                            </p>
                            <p className="font-bold text-white/60">
                              {m.totalMarks}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-white/40 uppercase">
                              Percentage
                            </p>
                            <p className="font-bold text-lime-400">
                              {m.percentage}%
                            </p>
                          </div>
                        </div>
                      )}
                    </button>
                  ))}

                  {/* Mobile Total */}
                  <div className="rounded-xl border border-lime-400/20 bg-lime-400/5 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm uppercase">
                        Total
                      </span>
                      <GradeIndicator
                        grade={reportData.summary.overallGrade}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-white/40 uppercase">
                          Obtained
                        </p>
                        <p className="font-bold text-white">
                          {reportData.summary.totalObtained}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/40 uppercase">
                          Total
                        </p>
                        <p className="font-bold text-white/60">
                          {reportData.summary.totalMax}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/40 uppercase">
                          Percentage
                        </p>
                        <p className="font-bold text-lime-400">
                          {reportData.summary.overallPercentage}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Hidden PDF template for download/print */}
      <MarksReportTemplate ref={pdfRef} data={pdfData} />
    </div>
  );
}
