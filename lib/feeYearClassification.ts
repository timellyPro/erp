export type AcademicYearRange = {
  startYear: number;
  endYear: number;
};

export function currentAcademicYearStartYear(date = new Date()): number {
  return date.getMonth() >= 5 ? date.getFullYear() : date.getFullYear() - 1;
}

export function extractAcademicYearRange(text: string | null | undefined): AcademicYearRange | null {
  const raw = String(text ?? "");
  const match = raw.match(/\b(20\d{2})\s*[-/]\s*((?:20)?\d{2})\b/);
  if (!match) return null;

  const startYear = Number(match[1]);
  const rawEnd = match[2] ?? "";
  const endYear = rawEnd.length === 2 ? Number(`${String(startYear).slice(0, 2)}${rawEnd}`) : Number(rawEnd);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
  if (endYear < startYear) return null;
  return { startYear, endYear };
}

export function isPreviousYearFeeHeadName(
  name: string | null | undefined,
  currentStartYear = currentAcademicYearStartYear()
): boolean {
  const compact = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!compact) return false;
  const lower = compact.toLowerCase();

  if (
    (lower.includes("last year") || lower.includes("previous year")) &&
    (lower.includes("fee") || lower.includes("due") || lower.includes("balance") || lower.includes("pending"))
  ) {
    return true;
  }

  const range = extractAcademicYearRange(compact);
  if (!range || range.startYear >= currentStartYear) return false;

  return (
    lower.includes("fee") ||
    lower.includes("due") ||
    lower.includes("balance") ||
    lower.includes("pending") ||
    lower.includes("last") ||
    lower.includes("previous")
  );
}

export function previousYearFeeHeadLabel(name: string | null | undefined): string | null {
  if (!isPreviousYearFeeHeadName(name)) return null;
  const range = extractAcademicYearRange(name);
  if (!range) return "Previous Year Fee Due";
  return `Previous Year ${range.startYear}-${range.endYear} Fee Due`;
}
