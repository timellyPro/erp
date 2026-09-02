import type { FeesComparisonReport } from "@/lib/buildFeesComparisonReport";

export type FeesComparisonQuery = {
  rangeAFrom: string;
  rangeATo: string;
  rangeBFrom: string;
  rangeBTo: string;
};

const MEMORY_TTL_MS = 90_000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_KEY = "erp:fees-comparison:v1";

const memory = new Map<string, { expiresAt: number; value: FeesComparisonReport }>();
const inflight = new Map<string, Promise<FeesComparisonReport>>();

type SessionStore = Record<string, { savedAt: number; value: FeesComparisonReport }>;

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
    if (keys.length > 10) {
      keys
        .sort((a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0))
        .slice(10)
        .forEach((key) => delete store[key]);
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function feesComparisonCacheKey(
  schoolId: string | null | undefined,
  query: FeesComparisonQuery
): string {
  return [
    schoolId || "anon",
    query.rangeAFrom,
    query.rangeATo,
    query.rangeBFrom,
    query.rangeBTo,
  ].join(":");
}

export function peekFeesComparisonReport(
  schoolId: string | null | undefined,
  query: FeesComparisonQuery
): FeesComparisonReport | null {
  const key = feesComparisonCacheKey(schoolId, query);
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

function setFeesComparisonCached(
  schoolId: string | null | undefined,
  query: FeesComparisonQuery,
  value: FeesComparisonReport
): void {
  const key = feesComparisonCacheKey(schoolId, query);
  memory.set(key, { value, expiresAt: Date.now() + MEMORY_TTL_MS });
  const store = readSession();
  store[key] = { savedAt: Date.now(), value };
  writeSession(store);
}

export async function loadFeesComparisonReport(
  schoolId: string | null | undefined,
  query: FeesComparisonQuery,
  options?: { signal?: AbortSignal; revalidate?: boolean }
): Promise<{ data: FeesComparisonReport; fromCache: boolean }> {
  if (!options?.revalidate) {
    const cached = peekFeesComparisonReport(schoolId, query);
    if (cached) return { data: cached, fromCache: true };
  }

  const key = feesComparisonCacheKey(schoolId, query);
  const running = inflight.get(key);
  if (running) {
    return { data: await running, fromCache: false };
  }

  const run = (async () => {
    const qs = new URLSearchParams(query);
    const res = await fetch(`/api/school/analysis/fees-comparison?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
      signal: options?.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data.message === "string" ? data.message : "Failed to load comparison");
    }
    const report = data as FeesComparisonReport;
    setFeesComparisonCached(schoolId, query, report);
    return report;
  })();

  inflight.set(key, run);
  try {
    return { data: await run, fromCache: false };
  } finally {
    inflight.delete(key);
  }
}
