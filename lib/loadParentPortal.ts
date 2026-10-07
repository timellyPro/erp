import {
  getParentPortalCached,
  getParentPortalCachedEntry,
  parentCacheKey,
  peekParentPortalAny,
  setParentPortalCached,
  invalidateParentPortalClientCache,
  hasParentPortalCache,
} from "@/lib/parentPortalClientCache";
import type { ParentDashboardPayload } from "@/lib/buildParentDashboard";
import type { ParentAnalyticsPayload } from "@/lib/computeParentAnalytics";
import type { ParentBootstrapPayload } from "@/lib/buildParentBootstrap";
import type { ParentFeesPayload } from "@/lib/buildParentFeesMine";

export { peekParentPortalAny, invalidateParentPortalClientCache, hasParentPortalCache };
export type { ParentDashboardPayload, ParentAnalyticsPayload, ParentBootstrapPayload, ParentFeesPayload };

export function seedParentDetailsFromBootstrap(data: ParentBootstrapPayload): void {
  if (!data.parentDetails) return;
  setParentPortalCached(parentCacheKey("shell", "parent-details", "v1"), data.parentDetails);
}

export function peekParentDetailsFromBootstrap(): ParentBootstrapPayload["parentDetails"] | null {
  return getParentPortalCached<ParentBootstrapPayload["parentDetails"]>(
    parentCacheKey("shell", "parent-details", "v1")
  );
}

function seedParentPortalFromBootstrap(studentId: string, data: ParentBootstrapPayload): void {
  setParentPortalCached(parentCacheKey(studentId, "bootstrap", "v1"), data);
  setParentPortalCached(parentCacheKey(studentId, "dashboard", "fast"), data.dashboard);
  setParentPortalCached(parentCacheKey(studentId, "analytics", "fast"), data.analytics);
  if (data.profile) {
    setParentPortalCached(parentCacheKey(studentId, "profile", "shell"), data.profile);
  }
  seedParentDetailsFromBootstrap(data);
}

export function peekParentBootstrap(studentId?: string | null): ParentBootstrapPayload | null {
  if (studentId) {
    return getParentPortalCached<ParentBootstrapPayload>(parentCacheKey(studentId, "bootstrap", "v1"));
  }
  return peekParentPortalAny<ParentBootstrapPayload>("bootstrap", "v1");
}

/** Single request warms dashboard + analytics + profile client caches. */
export async function warmParentPortalBootstrap(
  studentId: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<ParentBootstrapPayload> {
  const key = parentCacheKey(studentId, "bootstrap", "v1");
  const entry = !options?.revalidate ? getParentPortalCachedEntry<ParentBootstrapPayload>(key) : null;
  if (entry) {
    scheduleBackgroundRevalidate<ParentBootstrapPayload>(
      key,
      "/api/parent/bootstrap",
      entry.savedAt
    );
    void fetchParentDashboard(studentId).catch(() => undefined);
    return entry.value;
  }

  const running = inflight.get(key) as Promise<ParentBootstrapPayload> | undefined;
  if (running) return running;

  const run = (async () => {
    const json = await fetchJson<ParentBootstrapPayload>("/api/parent/bootstrap", options?.signal);
    seedParentPortalFromBootstrap(studentId, json);
    return json;
  })();

  inflight.set(key, run);
  try {
    const result = await run;
    void fetchParentDashboard(studentId).catch(() => undefined);
    return result;
  } finally {
    inflight.delete(key);
  }
}

const inflight = new Map<string, Promise<unknown>>();
/** Background refresh if cached data is older than this (still shown instantly). */
const CLIENT_REVALIDATE_AFTER_MS = 3 * 60 * 1000;

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { message?: string })?.message || "Request failed");
  }
  return json as T;
}

function scheduleBackgroundRevalidate<T>(key: string, url: string, savedAt: number): void {
  if (Date.now() - savedAt < CLIENT_REVALIDATE_AFTER_MS) return;
  const bgKey = `bg:${key}`;
  if (inflight.has(bgKey)) return;

  const run = (async () => {
    try {
      const json = await fetchJson<T>(url);
      setParentPortalCached(key, json);
    } catch {
      /* keep stale client cache */
    }
  })();
  inflight.set(bgKey, run);
  void run.finally(() => inflight.delete(bgKey));
}

async function cachedFetch<T>(
  key: string,
  url: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<T> {
  const entry = !options?.revalidate ? getParentPortalCachedEntry<T>(key) : null;
  if (entry) {
    scheduleBackgroundRevalidate<T>(key, url, entry.savedAt);
    return entry.value;
  }

  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const run = (async () => {
    const json = await fetchJson<T>(url, options?.signal);
    setParentPortalCached(key, json);
    return json;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

export function peekParentDashboard(studentId?: string | null): ParentDashboardPayload | null {
  if (studentId) {
    return (
      getParentPortalCached<ParentDashboardPayload>(parentCacheKey(studentId, "dashboard", "full")) ??
      getParentPortalCached<ParentDashboardPayload>(parentCacheKey(studentId, "dashboard", "fast"))
    );
  }
  return (
    peekParentPortalAny<ParentDashboardPayload>("dashboard", "full") ??
    peekParentPortalAny<ParentDashboardPayload>("dashboard", "fast")
  );
}

export function hasParentDashboardCache(studentId: string): boolean {
  return (
    hasParentPortalCache(parentCacheKey(studentId, "dashboard", "full")) ||
    hasParentPortalCache(parentCacheKey(studentId, "dashboard", "fast"))
  );
}

export async function fetchParentDashboardFast(
  studentId: string,
  options?: { signal?: AbortSignal; revalidate?: boolean }
): Promise<ParentDashboardPayload> {
  const key = parentCacheKey(studentId, "dashboard", "fast");
  return cachedFetch<ParentDashboardPayload>(key, "/api/student/dashboard?fast=1", options);
}

export async function fetchParentDashboard(
  studentId: string,
  options?: { signal?: AbortSignal; revalidate?: boolean }
): Promise<ParentDashboardPayload> {
  const key = parentCacheKey(studentId, "dashboard", "full");
  return cachedFetch<ParentDashboardPayload>(key, "/api/student/dashboard", options);
}

/** Instant cache paint + optional background refresh — never blocks on network when cached. */
export async function loadParentDashboard(
  studentId: string,
  callbacks?: {
    onFastLoaded?: (data: ParentDashboardPayload) => void;
    onFullLoaded?: (data: ParentDashboardPayload) => void;
    signal?: AbortSignal;
  }
): Promise<ParentDashboardPayload> {
  const fullKey = parentCacheKey(studentId, "dashboard", "full");
  const fastKey = parentCacheKey(studentId, "dashboard", "fast");
  const fullCached = getParentPortalCached<ParentDashboardPayload>(fullKey);
  const fastCached = getParentPortalCached<ParentDashboardPayload>(fastKey);

  if (fullCached) {
    callbacks?.onFastLoaded?.(fullCached);
    callbacks?.onFullLoaded?.(fullCached);
    scheduleBackgroundRevalidate(fullKey, "/api/student/dashboard", getParentPortalCachedEntry(fullKey)?.savedAt ?? 0);
    return fullCached;
  }

  if (fastCached) {
    callbacks?.onFastLoaded?.(fastCached);
    scheduleBackgroundRevalidate(fastKey, "/api/student/dashboard?fast=1", getParentPortalCachedEntry(fastKey)?.savedAt ?? 0);
    void fetchParentDashboard(studentId, { signal: callbacks?.signal })
      .then((full) => callbacks?.onFullLoaded?.(full))
      .catch(() => undefined);
    return fastCached;
  }

  const fast = await fetchParentDashboardFast(studentId, { signal: callbacks?.signal });
  callbacks?.onFastLoaded?.(fast);

  const full = await fetchParentDashboard(studentId, { signal: callbacks?.signal });
  callbacks?.onFullLoaded?.(full);
  return full;
}

export function peekParentAnalytics(studentId?: string | null): ParentAnalyticsPayload | null {
  if (studentId) {
    return (
      getParentPortalCached<ParentAnalyticsPayload>(parentCacheKey(studentId, "analytics", "full")) ??
      getParentPortalCached<ParentAnalyticsPayload>(parentCacheKey(studentId, "analytics", "fast"))
    );
  }
  return (
    peekParentPortalAny<ParentAnalyticsPayload>("analytics", "full") ??
    peekParentPortalAny<ParentAnalyticsPayload>("analytics", "fast")
  );
}

export async function fetchParentAnalytics(
  studentId: string,
  options?: { fast?: boolean; revalidate?: boolean; signal?: AbortSignal }
): Promise<ParentAnalyticsPayload> {
  const key = parentCacheKey(studentId, "analytics", options?.fast ? "fast" : "full");
  const url = options?.fast ? "/api/analytics/student?fast=1" : "/api/analytics/student";
  return cachedFetch<ParentAnalyticsPayload>(key, url, options);
}

export async function loadParentAnalytics(
  studentId: string,
  callbacks?: {
    onLoaded?: (data: ParentAnalyticsPayload) => void;
    signal?: AbortSignal;
  }
): Promise<ParentAnalyticsPayload> {
  const fullKey = parentCacheKey(studentId, "analytics", "full");
  const fastKey = parentCacheKey(studentId, "analytics", "fast");
  const fullCached = getParentPortalCached<ParentAnalyticsPayload>(fullKey);
  const fastCached = getParentPortalCached<ParentAnalyticsPayload>(fastKey);

  if (fullCached) {
    callbacks?.onLoaded?.(fullCached);
    scheduleBackgroundRevalidate(fullKey, "/api/analytics/student", getParentPortalCachedEntry(fullKey)?.savedAt ?? 0);
    return fullCached;
  }

  if (fastCached) {
    callbacks?.onLoaded?.(fastCached);
    scheduleBackgroundRevalidate(fastKey, "/api/analytics/student?fast=1", getParentPortalCachedEntry(fastKey)?.savedAt ?? 0);
    void fetchParentAnalytics(studentId, { signal: callbacks?.signal })
      .then((full) => {
        setParentPortalCached(fullKey, full);
        callbacks?.onLoaded?.(full);
      })
      .catch(() => undefined);
    return fastCached;
  }

  const fast = await fetchParentAnalytics(studentId, { fast: true, signal: callbacks?.signal });
  callbacks?.onLoaded?.(fast);

  const full = await fetchParentAnalytics(studentId, { signal: callbacks?.signal });
  callbacks?.onLoaded?.(full);
  return full;
}

type HomeworkListResponse = { homeworks: unknown[] };
type EventsListResponse = { events: unknown[] };
type MarksViewResponse = { marks: unknown[] };
type AttendanceViewResponse = { attendances: unknown[] };

export async function fetchParentHomeworkList(
  studentId: string,
  subject?: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<HomeworkListResponse> {
  const params = new URLSearchParams();
  if (subject && subject !== "All Subjects") params.set("subject", subject);
  const paramStr = params.toString();
  const key = parentCacheKey(studentId, "homework", paramStr || "all");
  return cachedFetch<HomeworkListResponse>(
    key,
    `/api/homework/list${paramStr ? `?${paramStr}` : ""}`,
    options
  );
}

export async function fetchParentEventsList(
  studentId: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<EventsListResponse> {
  const key = parentCacheKey(studentId, "events", "all");
  return cachedFetch<EventsListResponse>(key, "/api/events/list", options);
}

export async function fetchParentMarks(
  studentId: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<MarksViewResponse> {
  const key = parentCacheKey(studentId, "marks", "all");
  return cachedFetch<MarksViewResponse>(key, "/api/marks/view", options);
}

export function peekParentProfileShell(studentId?: string | null) {
  if (studentId) {
    const boot = peekParentBootstrap(studentId);
    if (boot?.profile) return boot.profile;
    return getParentPortalCached(parentCacheKey(studentId, "profile", "shell"));
  }
  const boot = peekParentBootstrap(null);
  if (boot?.profile) return boot.profile;
  return peekParentPortalAny("profile", "shell");
}

export function peekParentFees(studentId?: string | null): ParentFeesPayload | null {
  if (studentId) {
    return getParentPortalCached<ParentFeesPayload>(parentCacheKey(studentId, "fees", "mine"));
  }
  return peekParentPortalAny<ParentFeesPayload>("fees", "mine");
}

export async function fetchParentFees(
  studentId: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<ParentFeesPayload> {
  const key = parentCacheKey(studentId, "fees", "mine");
  const entry = !options?.revalidate ? getParentPortalCachedEntry<ParentFeesPayload>(key) : null;
  if (entry) {
    scheduleBackgroundRevalidate<{ fee: ParentFeesPayload }>(key, "/api/fees/mine", entry.savedAt);
    return entry.value;
  }

  const running = inflight.get(key) as Promise<ParentFeesPayload> | undefined;
  if (running) return running;

  const run = (async () => {
    const json = await fetchJson<{ fee: ParentFeesPayload }>("/api/fees/mine", options?.signal);
    setParentPortalCached(key, json.fee);
    return json.fee;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

export async function loadParentFees(
  studentId: string,
  callbacks?: { onLoaded?: (data: ParentFeesPayload) => void; signal?: AbortSignal }
): Promise<ParentFeesPayload> {
  const key = parentCacheKey(studentId, "fees", "mine");
  const cached = getParentPortalCached<ParentFeesPayload>(key);
  if (cached) {
    callbacks?.onLoaded?.(cached);
    const savedAt = getParentPortalCachedEntry(key)?.savedAt ?? 0;
    if (Date.now() - savedAt >= CLIENT_REVALIDATE_AFTER_MS) {
      const bgKey = `bg:${key}`;
      if (!inflight.has(bgKey)) {
        const run = fetchParentFees(studentId, { revalidate: true }).catch(() => undefined);
        inflight.set(bgKey, run);
        void run.finally(() => inflight.delete(bgKey));
      }
    }
    return cached;
  }

  const fee = await fetchParentFees(studentId, { signal: callbacks?.signal });
  callbacks?.onLoaded?.(fee);
  return fee;
}

export async function fetchParentProfileShell(
  studentId: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
) {
  const key = parentCacheKey(studentId, "profile", "shell");
  return cachedFetch<Awaited<ReturnType<typeof import("@/lib/buildParentProfileShell").buildParentProfileShell>>>(
    key,
    "/api/parent/profile-shell",
    options
  );
}

export async function fetchParentAttendance(
  studentId: string,
  startDate: string,
  endDate: string,
  options?: { revalidate?: boolean; signal?: AbortSignal }
): Promise<AttendanceViewResponse> {
  const params = `startDate=${startDate}&endDate=${endDate}`;
  const key = parentCacheKey(studentId, "attendance", params);
  return cachedFetch<AttendanceViewResponse>(
    key,
    `/api/attendance/view?${params}`,
    options
  );
}

export function patchParentHomeworkAfterSubmit(
  studentId: string,
  homeworkId: string,
  submission: unknown
): void {
  for (const key of [parentCacheKey(studentId, "homework", "all")]) {
    const cached = getParentPortalCached<HomeworkListResponse>(key);
    if (!cached?.homeworks) continue;
    setParentPortalCached(key, {
      homeworks: cached.homeworks.map((hw) => {
        const item = hw as { id: string; hasSubmitted?: boolean; submission?: unknown };
        if (item.id !== homeworkId) return hw;
        return { ...item, hasSubmitted: true, submission };
      }),
    });
  }

  for (const suffix of ["fast", "full"] as const) {
    const dashKey = parentCacheKey(studentId, "dashboard", suffix);
    const dash = getParentPortalCached<ParentDashboardPayload>(dashKey);
    if (dash && dash.homeworkSubmitted < dash.homeworkTotal) {
      setParentPortalCached(dashKey, {
        ...dash,
        homeworkSubmitted: dash.homeworkSubmitted + 1,
      });
    }
  }
}
