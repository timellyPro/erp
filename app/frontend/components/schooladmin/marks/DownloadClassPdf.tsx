"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { normalizeExamTypes } from "@/lib/examTypes";
import { downloadClassReportCardsTwoUpPdf } from "@/lib/classReportCardsTwoUpPdf";

type ClassOption = {
  id: string;
  name: string;
  section: string | null;
  label: string;
};

type ReportPayload = {
  student: {
    name: string;
    class: string;
    admissionNumber: string;
    rollNo: string | null;
  };
  school: { name: string; address: string; logoUrl: string | null };
  marks: Array<{
    subject: string;
    marks: number;
    totalMarks: number;
    grade: string;
    examType: string | null;
  }>;
  summary: {
    totalObtained: number;
    totalMax: number;
    overallPercentage: number;
    overallGrade: string;
  };
};

export default function DownloadClassPdf() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classId, setClassId] = useState("");
  const [examTypeOptions, setExamTypeOptions] = useState<string[]>([
    "ALL",
    "TERM 1",
    "TERM 2",
    "FINAL",
  ]);
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [examType, setExamType] = useState("ALL");
  const [subject, setSubject] = useState("ALL");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setClassesLoading(true);
      try {
        const [classRes, examRes, subRes] = await Promise.all([
          fetch("/api/class/list?lite=1", { credentials: "include", cache: "no-store" }),
          fetch("/api/exam-types", { credentials: "include", cache: "no-store" }),
          fetch("/api/exam-subjects", { credentials: "include", cache: "no-store" }),
        ]);
        if (classRes.ok) {
          const data = await classRes.json().catch(() => ({}));
          const list = Array.isArray(data.classes)
            ? data.classes
            : Array.isArray(data)
              ? data
              : [];
          const mapped: ClassOption[] = list.map(
            (c: { id: string; name?: string; section?: string | null }) => ({
              id: c.id,
              name: c.name || "",
              section: c.section ?? null,
              label: c.section ? `${c.name} - ${c.section}` : c.name || c.id,
            })
          );
          setClasses(mapped);
          if (mapped.length > 0) setClassId(mapped[0].id);
        }
        if (examRes.ok) {
          const data = await examRes.json().catch(() => ({}));
          const names = normalizeExamTypes(data.examTypes).map((t) => t.name);
          if (names.length) setExamTypeOptions(["ALL", ...names]);
        }
        if (subRes.ok) {
          const data = await subRes.json().catch(() => ({}));
          const names: string[] = Array.isArray(data.subjects) ? data.subjects : [];
          setSubjectOptions(names);
        }
      } finally {
        setClassesLoading(false);
      }
    })();
  }, []);

  const fetchReport = useCallback(
    async (studentId: string, clsId: string): Promise<ReportPayload | null> => {
      const params = new URLSearchParams({ studentId, classId: clsId });
      if (examType && examType !== "ALL") params.set("examType", examType);
      const res = await fetch(`/api/marks/report-card?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return null;
      return (await res.json()) as ReportPayload;
    },
    [examType]
  );

  const handleDownload = async () => {
    if (!classId) {
      setError("Select a class");
      return;
    }
    setError("");
    setDownloading(true);
    setProgress("Loading students...");
    try {
      const stuRes = await fetch(
        `/api/class/students?classId=${encodeURIComponent(classId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const stuData = await stuRes.json().catch(() => ({}));
      const students: Array<{
        id: string;
        rollNo?: string | null;
        user?: { name?: string | null };
      }> = Array.isArray(stuData.students) ? stuData.students : [];

      if (students.length === 0) {
        throw new Error("No students found in this class");
      }

      const cards = [];
      let schoolName = "School";
      let schoolAddress = "";
      let schoolLogoUrl: string | null = null;

      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        setProgress(`Report ${i + 1} / ${students.length}: ${s.user?.name || "Student"}`);
        const report = await fetchReport(s.id, classId);
        if (!report) continue;

        schoolName = report.school.name || schoolName;
        schoolAddress = report.school.address || schoolAddress;
        if (report.school.logoUrl) schoolLogoUrl = report.school.logoUrl;

        let marks = report.marks || [];
        if (subject && subject !== "ALL") {
          const key = subject.trim().toUpperCase();
          marks = marks.filter(
            (m) => m.subject.trim().toUpperCase() === key
          );
        }
        if (marks.length === 0) continue;

        const totalObtained = marks.reduce((a, m) => a + (m.grade === "AB" ? 0 : m.marks), 0);
        const totalMax = marks.reduce((a, m) => a + m.totalMarks, 0);
        const pct = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
        const grade =
          marks.every((m) => m.grade === "AB")
            ? "AB"
            : pct >= 90
              ? "A+"
              : pct >= 80
                ? "A"
                : pct >= 70
                  ? "B+"
                  : pct >= 60
                    ? "B"
                    : pct >= 50
                      ? "C"
                      : pct >= 35
                        ? "D"
                        : "F";

        cards.push({
          studentName: report.student.name,
          studentClass: report.student.class,
          admissionNumber: report.student.admissionNumber,
          rollNo: report.student.rollNo ?? s.rollNo,
          overallScore: Number(pct.toFixed(1)),
          overallGrade: grade,
          totalMarks: totalObtained,
          totalMaxMarks: totalMax,
          marks: marks.map((m) => ({
            subject: m.subject,
            marks: m.marks,
            totalMarks: m.totalMarks,
            grade: m.grade,
            examType: m.examType,
          })),
        });
      }

      if (cards.length === 0) {
        throw new Error("No marks found for the selected filters");
      }

      setProgress("Building PDF...");
      const cls = classes.find((c) => c.id === classId);
      await downloadClassReportCardsTwoUpPdf({
        schoolName,
        schoolAddress,
        schoolLogoUrl,
        examTypeLabel: examType === "ALL" ? "All Exams" : examType,
        subjectLabel: subject === "ALL" ? "All Subjects" : subject,
        students: cards,
        fileName: `Class_Reports_${(cls?.label || "Class").replace(/\s+/g, "_")}_${examType.replace(/\s+/g, "_")}.pdf`,
      });
      setProgress("Done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download class PDF");
    } finally {
      setDownloading(false);
      setTimeout(() => setProgress(""), 1500);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white">Download Class PDF</h3>
        <p className="text-xs text-white/50 mt-0.5">
          Two students per A4 page. Filter by exam type and subject.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-white/50 mb-1">
            Class
          </label>
          <select
            value={classId}
            disabled={classesLoading || downloading}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-lime-400/50"
          >
            {classes.length === 0 ? (
              <option value="">No classes</option>
            ) : (
              classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-white/50 mb-1">
            Exam type
          </label>
          <select
            value={examType}
            disabled={downloading}
            onChange={(e) => setExamType(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-lime-400/50"
          >
            {examTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide text-white/50 mb-1">
            Subject
          </label>
          <select
            value={subject}
            disabled={downloading}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm outline-none focus:border-lime-400/50"
          >
            <option value="ALL">ALL</option>
            {subjectOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
      {progress && <p className="text-xs text-white/50">{progress}</p>}

      <button
        type="button"
        disabled={downloading || !classId}
        onClick={handleDownload}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 text-black text-sm font-bold disabled:opacity-60"
      >
        {downloading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Download size={16} />
        )}
        {downloading ? "Generating..." : "Download Class"}
      </button>
    </div>
  );
}
