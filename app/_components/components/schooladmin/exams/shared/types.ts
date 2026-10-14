export interface SyllabusUnit {
  id: string;
  unitName: string;
  completedPercent: number;
  order: number;
}

export interface SyllabusTracking {
  id: string;
  subject: string;
  completedPercent: number;
  units: SyllabusUnit[];
}

export interface ExamSchedule {
  id: string;
  subject: string;
  examDate: string;
  startTime: string;
  durationMin: number;
}

export interface TermData {
  id: string;
  name: string;
  status: "COMPLETED" | "UPCOMING" | "ONGOING";
  class: {
    id: string;
    name: string;
    section: string;
    teacher?: { name: string };
  };
  schedules: ExamSchedule[];
  syllabus: SyllabusTracking[];
}

export interface ClassData {
  id: string;
  name: string;
  section: string;
}
