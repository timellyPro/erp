import prisma from "@/lib/db";

export type ConfiguredSection = { name: string; maxMarks: number; order: number };

export type ConfiguredMarkLimits = {
  maxMarks: number | null;
  sections: ConfiguredSection[];
  source: "subject" | "exam";
};

function readSections(value: unknown): ConfiguredSection[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) return [];
  const sections: ConfiguredSection[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: unknown; maxMarks?: unknown; order?: unknown };
    if (typeof row.name !== "string") continue;
    const maxMarks = Number(row.maxMarks);
    if (!Number.isFinite(maxMarks)) continue;
    sections.push({
      name: row.name,
      maxMarks,
      order: Number(row.order) || sections.length,
    });
  }
  return sections;
}

/** Subject config overrides exam-type config only when that subject has its own settings. */
export async function loadConfiguredMarkLimits(opts: {
  schoolId: string;
  examType: string;
  subject: string;
}): Promise<ConfiguredMarkLimits | null> {
  const examName = opts.examType.trim().toUpperCase();
  const subjectName = opts.subject.trim().toUpperCase();
  if (!examName) return null;

  // One query. Subject rows are read with SQL so an older Prisma client still works.
  const rows = await prisma.$queryRaw<
    Array<{
      examMax: number | null;
      examSections: unknown;
      subjectMax: number | null;
      subjectSections: unknown;
    }>
  >`
    SELECT
      et."maxMarks" AS "examMax",
      COALESCE((
        SELECT json_agg(json_build_object(
          'name', es.name,
          'maxMarks', es."maxMarks",
          'order', es."order"
        ) ORDER BY es."order")
        FROM "ExamTypeSection" es
        WHERE es."examTypeId" = et.id
      ), '[]'::json) AS "examSections",
      sub."maxMarks" AS "subjectMax",
      COALESCE(sub.sections, '[]'::json) AS "subjectSections"
    FROM "ExamType" et
    LEFT JOIN LATERAL (
      SELECT
        s."maxMarks",
        (
          SELECT json_agg(json_build_object(
            'name', sec.name,
            'maxMarks', sec."maxMarks",
            'order', sec."order"
          ) ORDER BY sec."order")
          FROM "ExamTypeSubjectSection" sec
          WHERE sec."examTypeSubjectId" = s.id
        ) AS sections
      FROM "ExamTypeSubject" s
      WHERE s."examTypeId" = et.id
        AND upper(s.subject) = ${subjectName}
      LIMIT 1
    ) sub ON true
    WHERE et."schoolId" = ${opts.schoolId}
      AND et.name = ${examName}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  const subjectSections = readSections(row.subjectSections);
  const subjectMax = row.subjectMax == null ? null : Number(row.subjectMax);
  if (subjectSections.length > 0 || (subjectMax != null && subjectMax > 0)) {
    return {
      maxMarks: subjectSections.length
        ? subjectSections.reduce((a, s) => a + s.maxMarks, 0)
        : subjectMax,
      sections: subjectSections,
      source: "subject",
    };
  }

  const examSections = readSections(row.examSections);
  const examMax = row.examMax == null ? null : Number(row.examMax);
  if (examSections.length > 0 || (examMax != null && examMax > 0)) {
    return {
      maxMarks: examSections.length
        ? examSections.reduce((a, s) => a + s.maxMarks, 0)
        : examMax,
      sections: examSections,
      source: "exam",
    };
  }

  return null;
}

export function markLimitError(opts: {
  limits: ConfiguredMarkLimits | null;
  totalMarks: number;
  hasComponents: boolean;
  examType: string;
  subject: string;
}): string | null {
  const { limits, totalMarks, hasComponents, examType, subject } = opts;
  if (!limits) return null;
  const label =
    limits.source === "subject" ? `${examType} / ${subject}` : examType;
  if (limits.sections.length > 0 && !hasComponents) {
    return `${label} requires subsection marks (configured by school admin)`;
  }
  if (
    !hasComponents &&
    limits.sections.length === 0 &&
    limits.maxMarks != null &&
    limits.maxMarks > 0 &&
    Number(totalMarks) !== Number(limits.maxMarks)
  ) {
    return `Max marks for ${label} must be ${limits.maxMarks} (set by school admin)`;
  }
  return null;
}
