import { useState, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import {
  loadTeacherMarksClasses,
  peekTeacherMarksClasses,
} from "@/lib/teacher/loadTeacherFastTabs";
import type { MarksReportData } from "@/app/_components/components/pdf/MarksReportTemplate";
import { normalizeExamTypes } from "@/lib/exams/examTypes";
import { downloadMarksExcel } from "./downloadMarksExcel";
import { downloadMarksPdf } from "./downloadMarksPdf";
import { DEFAULT_EXAM_TYPES, mapLiteClasses, type ClassOption } from "./teacherDownloadReportsTypes";

export function useTeacherDownloadReportsState() {
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
        const names = normalizeExamTypes(data.examTypes).map((t) => t.name);
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

  const handleDownloadExcel = async () => {
    if (selectedClassIds.size === 0) return;
    setDownloading(true);
    setDownloadType("excel");
    setProgress({ current: 0, total: 0, label: "Fetching students..." });

    try {
      await downloadMarksExcel({
        classIds: Array.from(selectedClassIds),
        classes,
        selectedExamType,
        onProgress: setProgress,
      });
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
      await downloadMarksPdf({
        classIds: Array.from(selectedClassIds),
        classes,
        selectedExamType,
        pdfRef,
        setPdfData,
        onProgress: setProgress,
      });
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

  return {
    classesLoading,
    selectedClassIds,
    examTypeOptions,
    selectedExamType,
    setSelectedExamType,
    classSearch,
    setClassSearch,
    downloading,
    downloadType,
    progress,
    pdfRef,
    pdfData,
    filteredClasses,
    toggleClass,
    selectAll,
    handleDownloadExcel,
    handleDownloadPdf,
    allVisibleSelected,
  };
}
