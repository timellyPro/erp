import { fetchReportCard, fetchStudentsForClasses } from "./teacherDownloadReportsFetch";
import type { ClassOption } from "./teacherDownloadReportsTypes";

export async function downloadMarksExcel({
  classIds,
  classes,
  selectedExamType,
  onProgress,
}: {
  classIds: string[];
  classes: ClassOption[];
  selectedExamType: string;
  onProgress: (progress: { current: number; total: number; label: string }) => void;
}) {
  const students = await fetchStudentsForClasses(classIds, classes);
  onProgress({ current: 0, total: students.length, label: "Fetching marks..." });

  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  for (const classId of classIds) {
    const cls = classes.find((c) => c.id === classId);
    const classStudents = students.filter((s) => s.classId === classId);
    if (classStudents.length === 0) continue;

    const sheetRows: Record<string, unknown>[] = [];

    for (let i = 0; i < classStudents.length; i++) {
      const student = classStudents[i];
      onProgress({
        current: students.indexOf(student) + 1,
        total: students.length,
        label: `${student.name} (${cls?.label})`,
      });

      const report = await fetchReportCard(student.id, classId, selectedExamType);
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
  onProgress({ current: students.length, total: students.length, label: "Done!" });
}
