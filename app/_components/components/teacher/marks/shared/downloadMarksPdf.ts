import type { RefObject } from "react";
import { flushSync } from "react-dom";
import type { MarksReportData } from "@/app/_components/components/pdf/MarksReportTemplate";
import { waitForPdfMountReady } from "@/lib/pdfUtils";
import { resolveSchoolLogoFetchUrl } from "@/lib/fees/feeDayReportExcel";
import { fetchReportCard, fetchStudentsForClasses } from "./teacherDownloadReportsFetch";
import type { ClassOption } from "./teacherDownloadReportsTypes";

export async function downloadMarksPdf({
  classIds,
  classes,
  selectedExamType,
  pdfRef,
  setPdfData,
  onProgress,
}: {
  classIds: string[];
  classes: ClassOption[];
  selectedExamType: string;
  pdfRef: RefObject<HTMLDivElement | null>;
  setPdfData: (data: MarksReportData | null) => void;
  onProgress: (progress: { current: number; total: number; label: string }) => void;
}) {
  const students = await fetchStudentsForClasses(classIds, classes);
  onProgress({ current: 0, total: students.length, label: "Generating PDFs..." });

  const { jsPDF } = await import("jspdf");
  const mergedPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let firstPage = true;

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const cls = classes.find((c) => c.id === student.classId);
    onProgress({
      current: i + 1,
      total: students.length,
      label: `${student.name} (${cls?.label})`,
    });

    const report = await fetchReportCard(student.id, student.classId, selectedExamType);
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
  onProgress({ current: students.length, total: students.length, label: "Done!" });
}
