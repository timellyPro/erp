import {
  dashboardCacheKey,
  getSchoolDashboardCached,
  peekSchoolDashboardAny,
  setSchoolDashboardCached,
  type SchoolDashboardPayload,
} from "@/lib/schoolDashboardClientCache";

export { peekSchoolDashboardAny };

const inflight = new Map<string, Promise<SchoolDashboardPayload>>();

export type { SchoolDashboardPayload };

export async function fetchSchoolDashboard(
  dateYmd: string,
  options?: {
    schoolId?: string | null;
    signal?: AbortSignal;
    /** Skip client cache read (still writes after fetch; server cache applies). */
    revalidate?: boolean;
  }
): Promise<SchoolDashboardPayload> {
  const key = options?.schoolId
    ? dashboardCacheKey(options.schoolId, dateYmd)
    : `anon:${dateYmd}`;

  if (!options?.revalidate) {
    const cached = getSchoolDashboardCached(key);
    if (cached) return cached;
  }

  const running = inflight.get(key);
  if (running) return running;

  const run = (async () => {
    const res = await fetch(
      `/api/school/dashboard?date=${encodeURIComponent(dateYmd)}`,
      { credentials: "include", cache: "no-store", signal: options?.signal }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (json as { message?: string })?.message || "Failed to load dashboard"
      );
    }
    const payload = json as SchoolDashboardPayload;
    if (options?.schoolId) {
      setSchoolDashboardCached(key, payload);
    }
    return payload;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

export function peekSchoolDashboard(
  schoolId: string | null | undefined,
  dateYmd: string
): SchoolDashboardPayload | null {
  if (!schoolId) return null;
  return getSchoolDashboardCached(dashboardCacheKey(schoolId, dateYmd));
}
