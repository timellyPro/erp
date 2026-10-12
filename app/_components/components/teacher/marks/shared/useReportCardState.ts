import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  loadTeacherMarksClasses,
  peekTeacherMarksClasses,
} from "@/lib/teacher/loadTeacherFastTabs";
import type { MarksReportData } from "@/app/_components/components/pdf/MarksReportTemplate";
import { generatePDF, waitForPdfMountReady } from "@/lib/pdfUtils";
import { resolveSchoolLogoFetchUrl } from "@/lib/fees/feeDayReportExcel";
import { normalizeExamTypes } from "@/lib/exams/examTypes";
import { DEFAULT_EXAM_TYPES, mapLiteClasses, type ClassOption, type ReportCardData, type StudentOption } from "./reportCardTypes";

export function useReportCardState({ scope }: { scope: "teacher" | "school" }) {
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
          const res = await fetch("/api/class/list?lite=1&all=1", {
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
        const names = normalizeExamTypes(data.examTypes).map((t) => t.name);
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

  return {
    classesLoading,
    students,
    studentsLoading,
    examTypeOptions,
    searchQuery,
    setSearchQuery,
    selectedClassLabel,
    selectedStudentId,
    selectedExamType,
    setSelectedExamType,
    reportData,
    reportLoading,
    pdfLoading,
    expandedSubject,
    setExpandedSubject,
    pdfRef,
    classOptions,
    filteredStudents,
    pdfData,
    displaySchoolLogo,
    handleDownloadPdf,
    handlePrint,
    handleClassChange,
    handleStudentSelect,
  };
}
