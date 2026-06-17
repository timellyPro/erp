import type {
  SchoolDashboardCollectionByHead,
  SchoolDashboardCollectionPayload,
  SchoolDashboardCollectionSummary,
} from "@/lib/buildSchoolDashboardCollection";

export type { SchoolDashboardCollectionPayload };

const CLIENT_CACHE_TTL_MS = 5 * 60_000;
const summaryCache = new Map<string, { at: number; value: SchoolDashboardCollectionSummary }>();
const headsCache = new Map<string, { at: number; value: SchoolDashboardCollectionByHead }>();
const inflight = new Map<string, Promise<unknown>>();

function cacheKey(dateYmd: string, part: "summary" | "heads" | "full") {
  return `${part}:${dateYmd}`;
}

function readCache<T>(map: Map<string, { at: number; value: T }>, key: string): T | null {
  const hit = map.get(key);
  if (!hit || Date.now() - hit.at > CLIENT_CACHE_TTL_MS) {
    if (hit) map.delete(key);
    return null;
  }
  return hit.value;
}

async function fetchCollectionPart<T>(
  dateYmd: string,
  part: "summary" | "heads" | "full",
  signal?: AbortSignal
): Promise<T> {
  const key = cacheKey(dateYmd, part);
  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const qs = new URLSearchParams({ date: dateYmd });
  if (part === "summary") qs.set("part", "summary");
  else if (part === "heads") qs.set("part", "heads");

  const run = (async () => {
    const res = await fetch(`/api/school/dashboard/collection?${qs.toString()}`, {
      credentials: "include",
      cache: "no-store",
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { message?: string })?.message || "Failed to load collection");
    }
    return data as T;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

/** Fast header totals (cash / online / total). */
export async function loadSchoolDashboardCollectionSummary(
  dateYmd: string,
  signal?: AbortSignal
): Promise<SchoolDashboardCollectionSummary> {
  const key = cacheKey(dateYmd, "summary");
  const cached = readCache(summaryCache, key);
  if (cached) return cached;

  const value = await fetchCollectionPart<SchoolDashboardCollectionSummary>(
    dateYmd,
    "summary",
    signal
  );
  summaryCache.set(key, { at: Date.now(), value });
  return value;
}

/** Fee-head table for the selected day. */
export async function loadSchoolDashboardCollectionHeads(
  dateYmd: string,
  signal?: AbortSignal
): Promise<SchoolDashboardCollectionByHead> {
  const key = cacheKey(dateYmd, "heads");
  const cached = readCache(headsCache, key);
  if (cached) return cached;

  const value = await fetchCollectionPart<SchoolDashboardCollectionByHead>(
    dateYmd,
    "heads",
    signal
  );
  headsCache.set(key, { at: Date.now(), value });
  return value;
}

export function peekSchoolDashboardCollectionHeads(
  dateYmd: string
): SchoolDashboardCollectionByHead | null {
  return readCache(headsCache, cacheKey(dateYmd, "heads"));
}

/** Prefetch day-wise collection (non-blocking). */
export function warmSchoolDashboardCollectionHeads(dateYmd: string): void {
  const key = cacheKey(dateYmd, "heads");
  if (readCache(headsCache, key)) return;
  if (inflight.has(key)) return;
  void loadSchoolDashboardCollectionHeads(dateYmd).catch(() => {});
}

export function setSchoolDashboardCollectionHeadsCached(
  dateYmd: string,
  value: SchoolDashboardCollectionByHead
): void {
  headsCache.set(cacheKey(dateYmd, "heads"), { at: Date.now(), value });
}

/** @deprecated Prefer split summary + heads loaders for faster UI. */
export async function loadSchoolDashboardCollection(
  dateYmd: string,
  signal?: AbortSignal
): Promise<SchoolDashboardCollectionPayload> {
  const summaryKey = cacheKey(dateYmd, "summary");
  const headsKey = cacheKey(dateYmd, "heads");
  const cachedSummary = readCache(summaryCache, summaryKey);
  const cachedHeads = readCache(headsCache, headsKey);
  if (cachedSummary && cachedHeads) {
    return { ...cachedSummary, todayCollectionByHead: cachedHeads };
  }

  const [summary, heads] = await Promise.all([
    cachedSummary ?? loadSchoolDashboardCollectionSummary(dateYmd, signal),
    cachedHeads ?? loadSchoolDashboardCollectionHeads(dateYmd, signal),
  ]);
  return { ...summary, todayCollectionByHead: heads };
}
