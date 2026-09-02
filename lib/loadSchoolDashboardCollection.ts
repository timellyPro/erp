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

function rangeKey(fromYmd: string, toYmd?: string) {
  return `${fromYmd}:${toYmd || fromYmd}`;
}

function cacheKey(fromYmd: string, part: "summary" | "heads" | "full", toYmd?: string) {
  return `${part}:${rangeKey(fromYmd, toYmd)}`;
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
  fromYmd: string,
  part: "summary" | "heads" | "full",
  toYmd?: string,
  signal?: AbortSignal
): Promise<T> {
  const key = cacheKey(fromYmd, part, toYmd);
  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const qs = new URLSearchParams({ from: fromYmd, to: toYmd || fromYmd });
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
  fromYmd: string,
  toYmd?: string,
  signal?: AbortSignal
): Promise<SchoolDashboardCollectionSummary> {
  const key = cacheKey(fromYmd, "summary", toYmd);
  const cached = readCache(summaryCache, key);
  if (cached) return cached;

  const value = await fetchCollectionPart<SchoolDashboardCollectionSummary>(
    fromYmd,
    "summary",
    toYmd,
    signal
  );
  summaryCache.set(key, { at: Date.now(), value });
  return value;
}

/** Fee-head table for the selected day. */
export async function loadSchoolDashboardCollectionHeads(
  fromYmd: string,
  toYmd?: string,
  signal?: AbortSignal
): Promise<SchoolDashboardCollectionByHead> {
  const key = cacheKey(fromYmd, "heads", toYmd);
  const cached = readCache(headsCache, key);
  if (cached) return cached;

  const value = await fetchCollectionPart<SchoolDashboardCollectionByHead>(
    fromYmd,
    "heads",
    toYmd,
    signal
  );
  headsCache.set(key, { at: Date.now(), value });
  return value;
}

export function peekSchoolDashboardCollectionHeads(
  fromYmd: string,
  toYmd?: string
): SchoolDashboardCollectionByHead | null {
  return readCache(headsCache, cacheKey(fromYmd, "heads", toYmd));
}

/** Prefetch day-wise collection (non-blocking). */
export function warmSchoolDashboardCollectionHeads(fromYmd: string, toYmd?: string): void {
  const key = cacheKey(fromYmd, "heads", toYmd);
  if (readCache(headsCache, key)) return;
  if (inflight.has(key)) return;
  void loadSchoolDashboardCollectionHeads(fromYmd, toYmd).catch(() => {});
}

export function setSchoolDashboardCollectionHeadsCached(
  fromYmd: string,
  value: SchoolDashboardCollectionByHead
): void {
  headsCache.set(cacheKey(fromYmd, "heads"), { at: Date.now(), value });
}

/** @deprecated Prefer split summary + heads loaders for faster UI. */
export async function loadSchoolDashboardCollection(
  fromYmd: string,
  toYmd?: string,
  signal?: AbortSignal
): Promise<SchoolDashboardCollectionPayload> {
  const summaryKey = cacheKey(fromYmd, "summary", toYmd);
  const headsKey = cacheKey(fromYmd, "heads", toYmd);
  const cachedSummary = readCache(summaryCache, summaryKey);
  const cachedHeads = readCache(headsCache, headsKey);
  if (cachedSummary && cachedHeads) {
    return { ...cachedSummary, todayCollectionByHead: cachedHeads };
  }

  const [summary, heads] = await Promise.all([
    cachedSummary ?? loadSchoolDashboardCollectionSummary(fromYmd, toYmd, signal),
    cachedHeads ?? loadSchoolDashboardCollectionHeads(fromYmd, toYmd, signal),
  ]);
  return { ...summary, todayCollectionByHead: heads };
}
