export interface HomeworkClass {
  id: string;
  name: string;
  section: string | null;
  _count?: { students: number };
}

export interface HomeworkItem {
  id: string;
  title: string;
  description: string;
  subject: string;
  dueDate: string | null;
  assignedDate?: string | null;
  file?: string | null;
  createdAt: string;
  class: HomeworkClass;
  _count: { submissions: number };
}

export interface ClassOption {
  id: string;
  name: string;
  section: string | null;
}


export type HomeworkFilter = "all" | "active" | "closed";

export const SUBJECT_OPTIONS = [
  "Mathematics",
  "Science",
  "English",
  "Social Studies",
  "Hindi",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "Other",
] as const;
