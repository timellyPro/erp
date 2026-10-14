import { apiGet } from "./http";

export type MarksReportCardResponse = {
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

export type MarksViewRecord = {
  studentId: string;
  marks: number;
  totalMarks: number;
  grade?: string | null;
};

export type MarksViewResponse = {
  marks?: MarksViewRecord[];
};

export function fetchClassMarksView(classId: string) {
  return apiGet<MarksViewResponse>(`/api/marks/view?classId=${classId}`);
}

export function fetchMarksReportCard(params: {
  studentId: string;
  classId: string;
  examType?: string;
}) {
  const query = new URLSearchParams({
    studentId: params.studentId,
    classId: params.classId,
  });
  if (params.examType) query.set("examType", params.examType);
  return apiGet<MarksReportCardResponse>(`/api/marks/report-card?${query}`, {
    cache: "no-store",
  });
}
