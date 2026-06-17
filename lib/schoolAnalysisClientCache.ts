import type { SchoolAnalysisPayload } from "@/lib/schoolAnalysisTypes";

const MEMORY_TTL_MS = 90_000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_KEY = "erp:school-analysis:v1";
const LAST_SCHOOL_KEY = "erp:school-analysis:last-school";

const memory = new Map<string, { expiresAt: number; value: SchoolAnalysisPayload }>();

type SessionStore = Record<string, { savedAt: number; value: SchoolAnalysisPayload }>;

function readSession(): SessionStore {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as SessionStore;
  } catch {
    return {};
  }
}

function writeSession(store: SessionStore): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys = Object.keys(store);
    if (keys.length > 8) {
      keys
        .sort((a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0))
        .slice(8)
        .forEach((k) => delete store[k]);
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function analysisCacheKey(
  schoolId: string,
  year: number,
  classId: string
): string {
  return `${schoolId}:${year}:${classId || "all"}`;
}

export function getSchoolAnalysisCached(key: string): SchoolAnalysisPayload | null {
  const mem = memory.get(key);
  if (mem && Date.now() < mem.expiresAt) return mem.value;

  const store = readSession();
  const entry = store[key];
  if (!entry || Date.now() - entry.savedAt > SESSION_TTL_MS) {
    if (entry) {
      delete store[key];
      writeSession(store);
    }
    return null;
  }
  return entry.value;
}

export function setSchoolAnalysisCached(key: string, value: SchoolAnalysisPayload): void {
  memory.set(key, { value, expiresAt: Date.now() + MEMORY_TTL_MS });
  const store = readSession();
  store[key] = { savedAt: Date.now(), value };
  writeSession(store);
  const schoolId = key.split(":")[0];
  if (schoolId && schoolId !== "anon") {
    try {
      sessionStorage?.setItem(LAST_SCHOOL_KEY, schoolId);
    } catch {
      /* ignore */
    }
  }
}

export function peekSchoolAnalysisAny(
  year: number,
  classId = ""
): SchoolAnalysisPayload | null {
  const anon = getSchoolAnalysisCached(`anon:${year}:${classId || "all"}`);
  if (anon) return anon;

  if (typeof sessionStorage === "undefined") return null;
  try {
    const schoolId = sessionStorage.getItem(LAST_SCHOOL_KEY);
    if (!schoolId) return null;
    return getSchoolAnalysisCached(analysisCacheKey(schoolId, year, classId));
  } catch {
    return null;
  }
}

export function analysisHasTables(payload: SchoolAnalysisPayload | null | undefined): boolean {
  return Boolean(
    payload &&
      Array.isArray(payload.feeCollectionByClass) &&
      Array.isArray(payload.enrollmentByClassSection) &&
      Array.isArray(payload.admissionComparison)
  );
}

export function invalidateSchoolAnalysisCache(schoolId?: string): void {
  if (!schoolId) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  for (const key of memory.keys()) {
    if (key.startsWith(`${schoolId}:`)) memory.delete(key);
  }
  const store = readSession();
  for (const key of Object.keys(store)) {
    if (key.startsWith(`${schoolId}:`)) delete store[key];
  }
  writeSession(store);
}
