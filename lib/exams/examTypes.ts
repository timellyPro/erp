export type ExamTypeSectionOption = {
  id?: string;
  name: string;
  maxMarks: number;
  order: number;
};

export type ExamTypeSubjectConfig = {
  subject: string;
  maxMarks: number | null;
  sections: ExamTypeSectionOption[];
};

export type ExamTypeOption = {
  name: string;
  maxMarks: number | null;
  sections: ExamTypeSectionOption[];
  /** Per-subject max marks and subsections. Existing exam-type settings stay on `sections`. */
  subjectConfigs?: ExamTypeSubjectConfig[];
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
      const sections = parseSections((item as { sections?: unknown }).sections);
      const subjectConfigs = parseSubjectConfigs(
        (item as { subjectConfigs?: unknown }).subjectConfigs
      );
      byName.set(name, {
        name,
        maxMarks:
          Number.isFinite(maxMarks as number) && (maxMarks as number) > 0
            ? (maxMarks as number)
            : null,
        sections,
        subjectConfigs,
      });
    }
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function parseSections(raw: unknown): ExamTypeSectionOption[] {
  const sections: ExamTypeSectionOption[] = [];
  if (!Array.isArray(raw)) return sections;
  raw.forEach((s, i) => {
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
  return sections;
}

function parseSubjectConfigs(raw: unknown): ExamTypeSubjectConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: ExamTypeSubjectConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const subject = String((item as { subject?: unknown }).subject || "")
      .trim()
      .toUpperCase();
    if (!subject) continue;
    const maxRaw = (item as { maxMarks?: unknown }).maxMarks;
    const maxMarks =
      maxRaw === null || maxRaw === undefined || maxRaw === ""
        ? null
        : Number(maxRaw);
    out.push({
      subject,
      maxMarks:
        Number.isFinite(maxMarks as number) && (maxMarks as number) > 0
          ? (maxMarks as number)
          : null,
      sections: parseSections((item as { sections?: unknown }).sections),
    });
  }
  return out.sort((a, b) => a.subject.localeCompare(b.subject));
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

export function subjectConfigFor(
  types: ExamTypeOption[],
  examType: string,
  subject: string
): ExamTypeSubjectConfig | null {
  const examKey = examType.trim().toUpperCase();
  const subjectKey = subject.trim().toUpperCase();
  if (!examKey || !subjectKey) return null;
  const found = types.find((t) => t.name === examKey);
  return found?.subjectConfigs?.find((c) => c.subject === subjectKey) ?? null;
}

/**
 * Subject settings win when that subject has its own max or subsections.
 * Otherwise the existing exam-type settings are used.
 */
export function resolveMarkSetup(
  types: ExamTypeOption[],
  examType: string,
  subject: string
): {
  sections: ExamTypeSectionOption[];
  maxMarks: number | null;
  source: "subject" | "exam" | "none";
} {
  const subjectCfg = subjectConfigFor(types, examType, subject);
  if (
    subjectCfg &&
    (subjectCfg.sections.length > 0 ||
      (subjectCfg.maxMarks != null && subjectCfg.maxMarks > 0))
  ) {
    const sections = subjectCfg.sections;
    const maxMarks = sections.length
      ? sections.reduce((a, s) => a + s.maxMarks, 0)
      : subjectCfg.maxMarks;
    return { sections, maxMarks, source: "subject" };
  }
  const sections = sectionsForExamType(types, examType);
  const maxMarks = maxMarksForExamType(types, examType);
  if (sections.length > 0 || (maxMarks != null && maxMarks > 0)) {
    return { sections, maxMarks, source: "exam" };
  }
  return { sections: [], maxMarks: null, source: "none" };
}
