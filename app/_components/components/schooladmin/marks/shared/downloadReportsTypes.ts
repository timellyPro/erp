export type ClassOption = {
  id: string;
  name: string;
  section: string | null;
  label: string;
};

export type ConsolidatedStudent = {
  id: string;
  name: string;
  rollNo: string | null;
  admissionNumber: string | null;
  section?: string | null;
  subjectMarks: Record<string, number | "AB" | null>;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  rank: number;
};

export type ConsolidatedSheet = {
  classId: string;
  className: string;
  section: string | null;
  label: string;
  includeSectionCol?: boolean;
  subjects: string[];
  students: ConsolidatedStudent[];
  examType?: string;
};

export type ConsolidatedPayload = {
  school: {
    name: string;
    address: string;
    logoUrl?: string | null;
    admins?: Array<{ photoUrl?: string | null }>;
  };
  examType: string;
  groupBy?: "class" | "section";
  sheets: ConsolidatedSheet[];
};

export const DEFAULT_EXAM_TYPES = ["ALL", "TERM 1", "TERM 2", "FINAL"];

export function sheetNameSafe(label: string, used: Set<string>): string {
  const base = label.replace(/[\\/?*[\]:]/g, " ").trim().substring(0, 31) || "Sheet";
  let name = base;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = `_${i}`;
    name = `${base.substring(0, 31 - suffix.length)}${suffix}`;
    i++;
  }
  used.add(name.toLowerCase());
  return name;
}

/** The exam types to download: "ALL" alone, or the picked names. */
export function resolveChosenExamTypes(selected: Set<string>): string[] {
  const picked = Array.from(selected).filter((name) => name !== "ALL");
  if (selected.has("ALL") || picked.length === 0) return ["ALL"];
  return picked;
}

export function examFileLabel(types: string[]): string {
  if (types.length === 0 || types.includes("ALL")) return "ALL_EXAMS";
  if (types.length === 1) return types[0].replace(/\s+/g, "_");
  return "MULTI_EXAMS";
}

export function normalizeClassName(name: string): string {
  return name.trim().toUpperCase();
}
