export type StudentRow = {
  id: string;
  rollNo: string;
  name: string;
  avatar: string;
  marks: number | "" | "AB";
  maxMarks: number | "";
  markId?: string;
  /** Per-subsection scores when the class term has sections */
  componentScores?: Record<string, number | "" | "AB">;
};

export type SavedMarkRow = {
  id: string;
  studentId: string;
  studentName: string;
  marks: number;
  totalMarks: number;
  grade: string | null;
  components?: Array<{ name: string; marks: number; totalMarks: number }>;
  status: "saved" | "already_saved";
};

export type ClassOption = { id: string; name: string; section: string | null };
export type MarksEntryForm = {
  classId: string;
  classLabel: string;
  section: string;
  subject: string;
  examType: string;
  maxMarks: number | "";
};
export type StudentApi = {
  id: string;
  rollNo: string | null;
  user: { id: string; name: string | null; email: string | null; photoUrl?: string | null };
  class?: { id: string; name: string; section: string | null };
};
export type MarkApi = {
  id: string;
  studentId: string;
  subject: string;
  marks: number;
  totalMarks: number;
  grade: string | null;
  examType?: string | null;
  createdAt: string;
  components?: Array<{ name: string; marks: number; totalMarks: number }>;
};
