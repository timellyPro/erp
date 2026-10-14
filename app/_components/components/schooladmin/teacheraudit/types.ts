export type TeacherRow = {
  id: string;
  name: string | null;
  email: string | null;
  photoUrl: string | null;
  teacherId: string | null;
  subject: string | null;
  performanceScore: number;
  recordCount: number;
};

export type AuditRecord = {
  id: string;
  category: string;
  customCategory: string | null;
  description: string;
  scoreImpact: number;
  createdAt: string;
  createdBy: { id: string; name: string | null };
};

export const AUDIT_CATEGORIES = [
  { id: "TEACHING_METHOD", label: "Teaching Method" },
  { id: "PUNCTUALITY", label: "Punctuality" },
  { id: "STUDENT_ENGAGEMENT", label: "Student Engagement" },
  { id: "INNOVATION", label: "Innovation" },
  { id: "EXTRA_CURRICULAR", label: "Extra Curricular" },
  { id: "RESULTS", label: "Results" },
] as const;

export const AUDIT_CATEGORY_OPTIONS = [
  ...AUDIT_CATEGORIES,
  { id: "CUSTOM", label: "Custom" },
] as const;

export function categoryToLabel(
  category: string,
  customCategory: string | null
): string {
  const found = AUDIT_CATEGORY_OPTIONS.find((c) => c.id === category);
  if (found)
    return found.id === "CUSTOM" ? customCategory || "Custom" : found.label;
  return category.replace(/_/g, " ");
}
