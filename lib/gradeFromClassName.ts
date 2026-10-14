/** Matches Prisma `Grade` enum on StudentApplication. */
export type ApplicationGrade =
  | "LKG"
  | "UKG"
  | "GRADE_1"
  | "GRADE_2"
  | "GRADE_3"
  | "GRADE_4"
  | "GRADE_5"
  | "GRADE_6"
  | "GRADE_7"
  | "GRADE_8"
  | "GRADE_9"
  | "GRADE_10"
  | "GRADE_11";

const VALID_GRADES = new Set<string>([
  "LKG",
  "UKG",
  "GRADE_1",
  "GRADE_2",
  "GRADE_3",
  "GRADE_4",
  "GRADE_5",
  "GRADE_6",
  "GRADE_7",
  "GRADE_8",
  "GRADE_9",
  "GRADE_10",
  "GRADE_11",
]);

/** Map a school `Class.name` (e.g. "CLASS 7", "LKG") to application `gradeSought`. */
export function gradeSoughtFromClassName(className: string | null | undefined): ApplicationGrade {
  const raw = String(className ?? "").trim();
  const upper = raw.toUpperCase().replace(/\s+/g, " ");
  if (upper === "LKG") return "LKG";
  if (upper === "UKG") return "UKG";

  const classNum = upper.match(/^CLASS\s*(\d{1,2})$/);
  if (classNum) {
    const key = `GRADE_${parseInt(classNum[1], 10)}`;
    if (VALID_GRADES.has(key)) return key as ApplicationGrade;
  }

  const gradeNum = upper.match(/^GRADE\s*(\d{1,2})$/);
  if (gradeNum) {
    const key = `GRADE_${parseInt(gradeNum[1], 10)}`;
    if (VALID_GRADES.has(key)) return key as ApplicationGrade;
  }

  return "GRADE_1";
}

export function formatClassOptionLabel(name: string, section: string | null | undefined): string {
  const n = String(name ?? "").trim();
  if (!n) return "—";
  const sec = section != null && String(section).trim() ? String(section).trim() : "";
  return sec ? `${n} · ${sec}` : n;
}
