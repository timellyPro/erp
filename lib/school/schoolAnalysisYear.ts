export function defaultAnalysisStartYear(now = new Date()): number {
  return now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

export function resolveAnalysisStartYear(yearParam: string | null | undefined, now = new Date()): number {
  const parsed = yearParam ? parseInt(yearParam, 10) : NaN;
  return Number.isNaN(parsed) ? defaultAnalysisStartYear(now) : parsed;
}
