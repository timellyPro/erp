export type ExamTypeSectionOption = {
  id?: string;
  name: string;
  maxMarks: number;
  order: number;
};

export type ExamTypeOption = {
  name: string;
  maxMarks: number | null;
  sections: ExamTypeSectionOption[];
};

/** Normalize /api/exam-types response (objects or legacy strings). */
export function normalizeExamTypes(raw: unknown): ExamTypeOption[] {
  if (!Array.isArray(raw)) return [];
  const byName = new Map<string, ExamTypeOption>();
  for (const item of raw) {
    if (typeof item === "string") {
      const name = item.trim().toUpperCase();
      if (name && !byName.has(name)) {
        byName.set(name, { name, maxMarks: null, sections: [] });
      }
      continue;
    }
    if (item && typeof item === "object" && "name" in item) {
      const name = String((item as { name: unknown }).name || "")
        .trim()
        .toUpperCase();
      if (!name) continue;
      const maxRaw = (item as { maxMarks?: unknown }).maxMarks;
      const maxMarks =
        maxRaw === null || maxRaw === undefined || maxRaw === ""
          ? null
          : Number(maxRaw);
      const sectionsRaw = (item as { sections?: unknown }).sections;
      const sections: ExamTypeSectionOption[] = [];
      if (Array.isArray(sectionsRaw)) {
        sectionsRaw.forEach((s, i) => {
          if (!s || typeof s !== "object") return;
          const secName = String((s as { name?: unknown }).name || "").trim();
          const secMax = Number((s as { maxMarks?: unknown }).maxMarks);
          if (!secName || !Number.isFinite(secMax) || secMax <= 0) return;
          sections.push({
            id:
              typeof (s as { id?: unknown }).id === "string"
                ? (s as { id: string }).id
                : undefined,
            name: secName,
            maxMarks: secMax,
            order:
              typeof (s as { order?: unknown }).order === "number"
                ? (s as { order: number }).order
                : i,
          });
        });
        sections.sort((a, b) => a.order - b.order);
      }
      byName.set(name, {
        name,
        maxMarks:
          Number.isFinite(maxMarks as number) && (maxMarks as number) > 0
            ? (maxMarks as number)
            : null,
        sections,
      });
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function examTypeNames(types: ExamTypeOption[]): string[] {
  return types.map((t) => t.name);
}

export function maxMarksForExamType(
  types: ExamTypeOption[],
  examType: string
): number | null {
  const key = examType.trim().toUpperCase();
  const found = types.find((t) => t.name === key);
  if (!found) return null;
  if (found.sections.length > 0) {
    return found.sections.reduce((a, s) => a + s.maxMarks, 0);
  }
  return found.maxMarks ?? null;
}

export function sectionsForExamType(
  types: ExamTypeOption[],
  examType: string
): ExamTypeSectionOption[] {
  const key = examType.trim().toUpperCase();
  return types.find((t) => t.name === key)?.sections ?? [];
}
