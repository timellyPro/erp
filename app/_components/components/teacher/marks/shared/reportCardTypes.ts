import type { LiteClassOption } from "@/lib/teacher/loadTeacherFastTabs";

export type ClassOption = { id: string; name: string; section: string | null };
export type StudentOption = { id: string; name: string; rollNo: string | null };

export type MarkRow = {
  subject: string;
  marks: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  examType: string | null;
};

export type ReportCardData = {
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

export function mapLiteClasses(list: LiteClassOption[]): ClassOption[] {
  return list.map((c) => ({ id: c.id, name: c.name, section: c.section ?? null }));
}

export const DEFAULT_EXAM_TYPES = ["ALL", "TERM 1", "TERM 2", "FINAL"];
