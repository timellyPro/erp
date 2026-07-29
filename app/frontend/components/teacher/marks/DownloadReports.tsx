"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Check,
  X,
  Search,
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

type ClassOption = { id: string; name: string; section: string | null; label: string };

type MarkRow = {
  subject: string;
  marks: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  examType: string | null;
};

type StudentReportData = {
  student: {
    name: string;
    class: string;
    admissionNumber: string;
    rollNo: string | null;
    fatherName: string;
  };
  school: { name: string; address: string; logoUrl: string | null };
  marks: MarkRow[];
  summary: {
    totalObtained: number;
    totalMax: number;
    overallPercentage: number;
    overallGrade: string;
    totalSubjects: number;
  };
};

type StudentBasic = {
  id: string;
  name: string;
  rollNo: string | null;
  admissionNumber: string;
  classId: string;
  className: string;
};

const DEFAULT_EXAM_TYPES = ["ALL", "TERM 1", "TERM 2", "FINAL"];

function mapLiteClasses(list: LiteClassOption[]): ClassOption[] {
  return list.map((c) => ({
    id: c.id,
    name: c.name,
    section: c.section ?? null,
    label: c.section ? `${c.name} - ${c.section}` : c.name,
  }));
}

export default function TeacherDownloadReports() {
  const initialClasses = peekTeacherMarksClasses();
  const [classes, setClasses] = useState<ClassOption[]>(() =>
    initialClasses ? mapLiteClasses(initialClasses) : []
  );
  const [classesLoading, setClassesLoading] = useState(() => !initialClasses);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [examTypeOptions, setExamTypeOptions] = useState<string[]>(DEFAULT_EXAM_TYPES);
  const [selectedExamType, setSelectedExamType] = useState("ALL");
  const [classSearch, setClassSearch] = useState("");

  const [downloading, setDownloading] = useState(false);
  const [downloadType, setDownloadType] = useState<"excel" | "pdf" | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });

  const pdfRef = useRef<HTMLDivElement>(null);
  const [pdfData, setPdfData] = useState<MarksReportData | null>(null);

  useEffect(() => {
    (async () => {
      const cached = peekTeacherMarksClasses();
      if (cached?.length) {
        setClasses(mapLiteClasses(cached));
        setClassesLoading(false);
      } else {
        setClassesLoading(true);
      }
      try {
        const list = await loadTeacherMarksClasses({ revalidate: true });
        setClasses(mapLiteClasses(list));
      } catch { /* noop */ }
      finally { setClassesLoading(false); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/exam-types", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const names: string[] = Array.isArray(data.examTypes) ? data.examTypes : [];
        if (names.length > 0) setExamTypeOptions(["ALL", ...names]);
      } catch { /* noop */ }
    })();
  }, []);

  const filteredClasses = useMemo(() => {
    if (!classSearch.trim()) return classes;
    const q = classSearch.toLowerCase();
    return classes.filter((c) => c.label.toLowerCase().includes(q));
  }, [classes, classSearch]);

  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const visible = filteredClasses.map((c) => c.id);
    setSelectedClassIds((prev) => {
      const next = new Set(prev);
      const allSelected = visible.every((id) => next.has(id));
      if (allSelected) visible.forEach((id) => next.delete(id));
      else visible.forEach((id) => next.add(id));
      return next;
    });
  };

  const fetchStudentsForClasses = async (classIds: string[]): Promise<StudentBasic[]> => {
    const all: StudentBasic[] = [];
    for (const classId of classIds) {
      const cls = classes.find((c) => c.id === classId);
      try {
        const res = await fetch(
          `/api/class/students?classId=${encodeURIComponent(classId)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        const students = Array.isArray(data.students) ? data.students : [];
        for (const s of students) {
          all.push({
            id: s.id,
            name: s.user?.name ?? "Student",
            rollNo: s.rollNo ?? null,
            admissionNumber: s.admissionNumber ?? "",
            classId,
            className: cls?.label ?? "",
          });
        }
      } catch { /* skip */ }
    }
    return all;
  };

  const fetchReportCard = async (
    studentId: string,
    classId: string
  ): Promise<StudentReportData | null> => {
    try {
      const params = new URLSearchParams({ studentId, classId });
      if (selectedExamType !== "ALL") params.set("examType", selectedExamType);
      const res = await fetch(`/api/marks/report-card?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  const handleDownloadExcel = async () => {
    if (selectedClassIds.size === 0) return;
    setDownloading(true);
    setDownloadType("excel");
    setProgress({ current: 0, total: 0, label: "Fetching students..." });

    try {
      const classIds = Array.from(selectedClassIds);
      const students = await fetchStudentsForClasses(classIds);
      setProgress({ current: 0, total: students.length, label: "Fetching marks..." });

      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();

      for (const classId of classIds) {
        const cls = classes.find((c) => c.id === classId);
        const classStudents = students.filter((s) => s.classId === classId);
        if (classStudents.length === 0) continue;

        const sheetRows: Record<string, unknown>[] = [];

        for (let i = 0; i < classStudents.length; i++) {
          const student = classStudents[i];
          setProgress({
            current: students.indexOf(student) + 1,
            total: students.length,
            label: `${student.name} (${cls?.label})`,
          });

          const report = await fetchReportCard(student.id, classId);
          if (!report || report.marks.length === 0) {
            sheetRows.push({
              "Roll No": student.rollNo ?? "—",
              "Student Name": student.name,
              "Admission No": student.admissionNumber,
              "Total Obtained": "—",
              "Total Max": "—",
              "Percentage": "—",
              "Grade": "—",
            });
            continue;
          }

          const subjectCols: Record<string, unknown> = {};
          for (const m of report.marks) {
            const label = m.examType && selectedExamType === "ALL"
              ? `${m.subject} (${m.examType})`
              : m.subject;
            subjectCols[label] = m.grade === "AB" ? "AB" : m.marks;
          }

          sheetRows.push({
            "Roll No": student.rollNo ?? "—",
            "Student Name": student.name,
            "Admission No": student.admissionNumber,
            ...subjectCols,
            "Total Obtained": report.summary.totalObtained,
            "Total Max": report.summary.totalMax,
            "Percentage": `${report.summary.overallPercentage}%`,
            "Grade": report.summary.overallGrade,
          });
        }

        const sheet = XLSX.utils.json_to_sheet(sheetRows);

        const colWidths = Object.keys(sheetRows[0] ?? {}).map((key) => ({
          wch: Math.max(key.length, 12),
        }));
        sheet["!cols"] = colWidths;

        const sheetName = (cls?.label ?? classId).substring(0, 31);
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      }

      const examLabel = selectedExamType === "ALL" ? "All_Exams" : selectedExamType.replace(/\s+/g, "_");
      XLSX.writeFile(workbook, `Marks_Report_${examLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setProgress({ current: students.length, total: students.length, label: "Done!" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate Excel");
    } finally {
      setTimeout(() => {
        setDownloading(false);
        setDownloadType(null);
      }, 1000);
    }
  };

  const handleDownloadPdf = async () => {
    if (selectedClassIds.size === 0) return;
    setDownloading(true);
    setDownloadType("pdf");
    setProgress({ current: 0, total: 0, label: "Fetching students..." });

    try {
      const classIds = Array.from(selectedClassIds);
      const students = await fetchStudentsForClasses(classIds);
      setProgress({ current: 0, total: students.length, label: "Generating PDFs..." });

      const { jsPDF } = await import("jspdf");
      const mergedPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      let firstPage = true;

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const cls = classes.find((c) => c.id === student.classId);
        setProgress({
          current: i + 1,
          total: students.length,
          label: `${student.name} (${cls?.label})`,
        });

        const report = await fetchReportCard(student.id, student.classId);
        if (!report || report.marks.length === 0) continue;

        const reportData: MarksReportData = {
          schoolName: report.school.name,
          schoolLogo: resolveSchoolLogoFetchUrl(report.school.logoUrl),
          schoolAddress: report.school.address,
          studentName: report.student.name,
          studentClass: report.student.class,
          admissionNumber: report.student.admissionNumber,
          dateGenerated: new Date(),
          overallScore: report.summary.overallPercentage,
          overallGrade: report.summary.overallGrade,
          totalMarks: report.summary.totalObtained,
          totalMaxMarks: report.summary.totalMax,
          marks: report.marks.map((m) => ({
            subject: m.subject,
            marks: m.marks,
            totalMarks: m.totalMarks,
            grade: m.grade,
            examType: m.examType,
          })),
        };

        flushSync(() => setPdfData(reportData));

        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await new Promise<void>((r) => requestAnimationFrame(() => r()));

        try {
          await waitForPdfMountReady(pdfRef, 200, 5000);
        } catch {
          continue;
        }

        const html2canvas = (await import("html2canvas-pro")).default;
        const el = pdfRef.current;
        if (!el) continue;

        const origStyles: { el: HTMLElement; opacity: string; position: string; left: string; top: string; zIndex: string; visibility: string }[] = [];
        let node: HTMLElement | null = el;
        while (node) {
          origStyles.push({
            el: node,
            opacity: node.style.opacity,
            position: node.style.position,
            left: node.style.left,
            top: node.style.top,
            zIndex: node.style.zIndex,
            visibility: node.style.visibility,
          });
          node.style.visibility = "visible";
          node.style.opacity = "1";
          if (getComputedStyle(node).position === "fixed") {
            node.style.position = "absolute";
            node.style.left = "0";
            node.style.top = "0";
            node.style.zIndex = "9999";
          }
          node = node.parentElement;
        }

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
          onclone: (_doc: Document, clonedEl: HTMLElement) => {
            let n: HTMLElement | null = clonedEl;
            while (n) {
              n.style.visibility = "visible";
              n.style.opacity = "1";
              n = n.parentElement;
            }
          },
        });

        for (const snap of origStyles) {
          snap.el.style.opacity = snap.opacity;
          snap.el.style.position = snap.position;
          snap.el.style.left = snap.left;
          snap.el.style.top = snap.top;
          snap.el.style.zIndex = snap.zIndex;
          snap.el.style.visibility = snap.visibility;
        }

        if (canvas.width < 2 || canvas.height < 2) continue;

        const imgData = canvas.toDataURL("image/png");
        const pdfWidth = mergedPdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        if (!firstPage) mergedPdf.addPage();
        mergedPdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        firstPage = false;
      }

      if (firstPage) {
        alert("No marks data found for the selected classes.");
        return;
      }

      const examLabel = selectedExamType === "ALL" ? "All_Exams" : selectedExamType.replace(/\s+/g, "_");
      mergedPdf.save(`Report_Cards_${examLabel}_${new Date().toISOString().slice(0, 10)}.pdf`);
      setProgress({ current: students.length, total: students.length, label: "Done!" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate PDF");
    } finally {
      flushSync(() => setPdfData(null));
      setTimeout(() => {
        setDownloading(false);
        setDownloadType(null);
      }, 1000);
    }
  };

  const allVisibleSelected = filteredClasses.length > 0 && filteredClasses.every((c) => selectedClassIds.has(c.id));

  return (
    <div className="space-y-6">
      {/* FILTERS */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Class Selection */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-medium text-white/60 uppercase tracking-widest">
                Select Classes
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/40">
                  {selectedClassIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-lime-400 hover:text-lime-300 font-medium"
                >
                  {allVisibleSelected ? "Deselect All" : "Select All"}
                </button>
              </div>
            </div>

            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search classes..."
                value={classSearch}
                onChange={(e) => setClassSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-black/30 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/25 outline-none focus:border-lime-400/40"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {classesLoading ? (
                <div className="col-span-full flex justify-center py-6">
                  <div className="w-6 h-6 border-2 border-lime-500/30 border-t-lime-500 rounded-full animate-spin" />
                </div>
              ) : filteredClasses.length === 0 ? (
                <p className="col-span-full text-white/30 text-sm text-center py-4">No classes found</p>
              ) : (
                filteredClasses.map((cls) => {
                  const selected = selectedClassIds.has(cls.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleClass(cls.id)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium border transition text-left flex items-center gap-2 ${
                        selected
                          ? "bg-lime-400/15 text-lime-400 border-lime-400/30"
                          : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border transition flex-shrink-0 ${
                          selected
                            ? "bg-lime-400 border-lime-400"
                            : "border-white/20"
                        }`}
                      >
                        {selected && <Check size={10} className="text-black" />}
                      </div>
                      <span className="truncate">{cls.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Exam Type */}
          <div>
            <label className="block text-xs font-medium text-white/60 mb-3 uppercase tracking-widest">
              Exam Type
            </label>
            <div className="space-y-2">
              {examTypeOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSelectedExamType(opt)}
                  className={`w-full px-4 py-2.5 rounded-xl text-sm font-medium border transition text-left ${
                    selectedExamType === opt
                      ? "bg-lime-400/15 text-lime-400 border-lime-400/30"
                      : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {opt === "ALL" ? "All Exams" : opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* DOWNLOAD BUTTONS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={handleDownloadExcel}
          disabled={downloading || selectedClassIds.size === 0}
          className={`rounded-2xl border p-6 flex items-center gap-4 transition group ${
            selectedClassIds.size === 0
              ? "border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed"
              : downloading && downloadType === "excel"
                ? "border-lime-400/30 bg-lime-400/5"
                : "border-white/10 bg-white/5 hover:border-lime-400/20 hover:bg-white/10 cursor-pointer"
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            {downloading && downloadType === "excel" ? (
              <Loader2 size={22} className="text-emerald-400 animate-spin" />
            ) : (
              <FileSpreadsheet size={22} className="text-emerald-400" />
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="font-semibold text-white text-sm">Download Excel</p>
            <p className="text-xs text-white/40 mt-0.5">
              {downloading && downloadType === "excel"
                ? progress.label
                : "Marks sheet with all subjects, grades & ranks"}
            </p>
          </div>
        </button>

        <button
          onClick={handleDownloadPdf}
          disabled={downloading || selectedClassIds.size === 0}
          className={`rounded-2xl border p-6 flex items-center gap-4 transition group ${
            selectedClassIds.size === 0
              ? "border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed"
              : downloading && downloadType === "pdf"
                ? "border-lime-400/30 bg-lime-400/5"
                : "border-white/10 bg-white/5 hover:border-lime-400/20 hover:bg-white/10 cursor-pointer"
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            {downloading && downloadType === "pdf" ? (
              <Loader2 size={22} className="text-blue-400 animate-spin" />
            ) : (
              <FileText size={22} className="text-blue-400" />
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="font-semibold text-white text-sm">Download Report Cards (PDF)</p>
            <p className="text-xs text-white/40 mt-0.5">
              {downloading && downloadType === "pdf"
                ? progress.label
                : "Individual report cards for all students in one PDF"}
            </p>
          </div>
        </button>
      </div>

      {/* PROGRESS BAR */}
      {downloading && progress.total > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/60">
              Processing {progress.current} of {progress.total} students
            </span>
            <span className="text-lime-400 font-medium">
              {Math.round((progress.current / progress.total) * 100)}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-lime-400 transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
          <p className="text-xs text-white/30 mt-2 truncate">{progress.label}</p>
        </div>
      )}

      {selectedClassIds.size === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center">
          <Download size={40} className="mx-auto text-white/15 mb-3" />
          <p className="text-white/40 text-sm">Select one or more classes above to download reports</p>
        </div>
      )}

      {/* Hidden PDF mount */}
      <MarksReportTemplate ref={pdfRef} data={pdfData} />
    </div>
  );
}
