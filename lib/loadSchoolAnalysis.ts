import { defaultAnalysisStartYear } from "@/lib/schoolAnalysisYear";
import {
  analysisCacheKey,
  analysisHasTables,
  getSchoolAnalysisCached,
  peekSchoolAnalysisAny,
  setSchoolAnalysisCached,
} from "@/lib/schoolAnalysisClientCache";
import type { SchoolAnalysisPayload } from "@/lib/schoolAnalysisTypes";

export type { SchoolAnalysisPayload };
export { analysisHasTables, peekSchoolAnalysisAny } from "@/lib/schoolAnalysisClientCache";
export { defaultAnalysisStartYear } from "@/lib/schoolAnalysisYear";

export type AnalysisSection =
  | "overview"
  | "gender-enrollment"
  | "admission-comparison"
  | "fee-collection"
  | "fees-comparison"
  | "student-credentials";

const inflight = new Map<string, Promise<SchoolAnalysisPayload>>();

function needsTables(section: AnalysisSection): boolean {
  return (
    section === "gender-enrollment" ||
    section === "admission-comparison" ||
    section === "fee-collection"
  );
}

function buildQuery(year: number, classId: string, extra?: Record<string, string>): string {
  const qs = new URLSearchParams();
  qs.set("year", String(year));
  if (classId) qs.set("classId", classId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  }
  return qs.toString();
}

async function fetchAnalysisUrl(
  year: number,
  classId: string,
  queryExtra: Record<string, string>,
  signal?: AbortSignal
): Promise<SchoolAnalysisPayload> {
  const res = await fetch(`/api/school/analysis?${buildQuery(year, classId, queryExtra)}`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || "Failed to load analysis");
  }
  if ((data as { message?: string }).message && !(data as SchoolAnalysisPayload).stats) {
    throw new Error((data as { message?: string }).message || "Failed to load analysis");
  }
  return data as SchoolAnalysisPayload;
}

function mergeAnalysis(
  base: SchoolAnalysisPayload | null,
  patch: Partial<SchoolAnalysisPayload>
): SchoolAnalysisPayload {
  return {
    availableYears: patch.availableYears ?? base?.availableYears ?? [],
    classes: patch.classes ?? base?.classes,
    selectedYear: patch.selectedYear ?? base?.selectedYear ?? defaultAnalysisStartYear(),
    stats: patch.stats ?? base?.stats ?? {
      feesCollected: 0,
      totalEnrollment: 0,
      avgTeacherRating: 0,
      avgExamScore: 0,
    },
    charts: patch.charts ?? base?.charts ?? {
      monthlyFeesCollection: [],
      enrollmentGrowth: [],
      attendance: { students: 0, teachers: 0 },
      subjectPerformance: [],
    },
    topTeachers: patch.topTeachers ?? base?.topTeachers ?? [],
    enrollmentByClassSection: patch.enrollmentByClassSection ?? base?.enrollmentByClassSection,
    enrollmentByClassSectionTotals:
      patch.enrollmentByClassSectionTotals ?? base?.enrollmentByClassSectionTotals,
    admissionComparison: patch.admissionComparison ?? base?.admissionComparison,
    admissionComparisonTotals:
      patch.admissionComparisonTotals ?? base?.admissionComparisonTotals,
    feeCollectionByClass: patch.feeCollectionByClass ?? base?.feeCollectionByClass,
    feeCollectionTotals: patch.feeCollectionTotals ?? base?.feeCollectionTotals,
  };
}

export function peekSchoolAnalysis(
  schoolId: string | null | undefined,
  year: number,
  classId = ""
): SchoolAnalysisPayload | null {
  if (!schoolId) return null;
  return getSchoolAnalysisCached(analysisCacheKey(schoolId, year, classId));
}

export async function fetchSchoolAnalysisFast(
  year: number,
  options?: { schoolId?: string | null; classId?: string; signal?: AbortSignal }
): Promise<SchoolAnalysisPayload> {
  const classId = options?.classId ?? "";
  const key = `fast:${options?.schoolId ?? "anon"}:${year}:${classId || "all"}`;
  const running = inflight.get(key);
  if (running) return running;

  const run = (async () => {
    const payload = await fetchAnalysisUrl(year, classId, { fast: "1" }, options?.signal);
    const cacheId = options?.schoolId;
    const cacheKey = cacheId
      ? analysisCacheKey(cacheId, year, classId)
      : `anon:${year}:${classId || "all"}`;
    const existing = getSchoolAnalysisCached(cacheKey);
    const merged = mergeAnalysis(existing, payload);
    setSchoolAnalysisCached(cacheKey, merged);
    return merged;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

export async function fetchSchoolAnalysisTables(
  year: number,
  options?: { schoolId?: string | null; classId?: string; signal?: AbortSignal }
): Promise<SchoolAnalysisPayload> {
  const classId = options?.classId ?? "";
  const key = `tables:${options?.schoolId ?? "anon"}:${year}:${classId || "all"}`;
  const running = inflight.get(key);
  if (running) return running;

  const run = (async () => {
    const tables = await fetchAnalysisUrl(year, classId, { part: "tables" }, options?.signal);
    const cacheId = options?.schoolId;
    const cacheKey = cacheId
      ? analysisCacheKey(cacheId, year, classId)
      : `anon:${year}:${classId || "all"}`;
    const existing = getSchoolAnalysisCached(cacheKey);
    const merged = mergeAnalysis(existing, tables);
    setSchoolAnalysisCached(cacheKey, merged);
    return merged;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

export async function loadSchoolAnalysis(
  section: AnalysisSection,
  year: number,
  options?: {
    schoolId?: string | null;
    classId?: string;
    signal?: AbortSignal;
    revalidate?: boolean;
  }
): Promise<{ data: SchoolAnalysisPayload; fromCache: boolean }> {
  const classId = options?.classId ?? "";
  const schoolId = options?.schoolId ?? null;
  const cacheKey = schoolId
    ? analysisCacheKey(schoolId, year, classId)
    : `anon:${year}:${classId || "all"}`;

  if (!options?.revalidate && schoolId) {
    const cached = getSchoolAnalysisCached(cacheKey);
    if (cached) {
      const ready =
        section === "overview" || section === "student-credentials"
          ? Boolean(cached.stats)
          : analysisHasTables(cached);
      if (ready) return { data: cached, fromCache: true };
    }
  }

  const shell = await fetchSchoolAnalysisFast(year, options);
  if (!needsTables(section)) {
    void fetchSchoolAnalysisTables(year, options).catch(() => {});
    return { data: shell, fromCache: false };
  }

  if (analysisHasTables(shell)) {
    return { data: shell, fromCache: false };
  }

  const full = await fetchSchoolAnalysisTables(year, options);
  return { data: full, fromCache: false };
}

const warmedSchools = new Set<string>();

export function warmSchoolAnalysisPage(schoolId: string | null | undefined): void {
  if (!schoolId || warmedSchools.has(schoolId)) return;
  warmedSchools.add(schoolId);

  const year = defaultAnalysisStartYear();
  void fetchSchoolAnalysisFast(year, { schoolId })
    .then(() => fetchSchoolAnalysisTables(year, { schoolId }))
    .catch(() => warmedSchools.delete(schoolId));
}

export function prefetchAnalysisSection(
  schoolId: string | null | undefined,
  section: AnalysisSection
): void {
  if (!schoolId || section === "student-credentials") return;
  const year = defaultAnalysisStartYear();
  void loadSchoolAnalysis(section, year, { schoolId, revalidate: true }).catch(() => {});
}
