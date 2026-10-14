import type { ClassOption, StudentBasic, StudentReportData } from "./teacherDownloadReportsTypes";

export async function fetchStudentsForClasses(
  classIds: string[],
  classes: ClassOption[]
): Promise<StudentBasic[]> {
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
}

export async function fetchReportCard(
  studentId: string,
  classId: string,
  selectedExamType: string
): Promise<StudentReportData | null> {
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
}
