export type TeacherExamSyllabusUnit = {
  subject?: string;
  completedPercent?: number | string;
};

export type TeacherExam = {
  id: string;
  name?: string;
  subject?: string;
  status: string;
  date?: string;
  time?: string;
  duration?: string | number;
  totalCoverage?: number | string;
  class?: { name?: string | number | null; section?: string | null } | null;
  syllabus?: TeacherExamSyllabusUnit[];
};
