import type { LiteClassOption } from "@/lib/teacher/loadTeacherFastTabs";

export type ClassOption = { id: string; name: string; section: string | null; label: string };

export type MarkRow = {
  subject: string;
  marks: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  examType: string | null;
};

export type StudentReportData = {
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

export type StudentBasic = {
  id: string;
  name: string;
  rollNo: string | null;
  admissionNumber: string;
  classId: string;
  className: string;
};

export const DEFAULT_EXAM_TYPES = ["ALL", "TERM 1", "TERM 2", "FINAL"];

export function mapLiteClasses(list: LiteClassOption[]): ClassOption[] {
  return list.map((c) => ({
    id: c.id,
    name: c.name,
    section: c.section ?? null,
    label: c.section ? `${c.name} - ${c.section}` : c.name,
  }));
}
