import { getSchoolDashboardServerCached, setSchoolDashboardServerCached } from "@/lib/schoolDashboardServerCache";

export function userListCacheKey(
  schoolId: string,
  page: number,
  pageSize: number,
  role: string,
  search: string
): string {
  return `users:all:${schoolId}:${page}:${pageSize}:${role}:${search.trim().toLowerCase()}`;
}

export function getUserListCached<T>(key: string): T | null {
  return getSchoolDashboardServerCached<T>(key);
}

export function setUserListCached(key: string, value: unknown, ttlMs = 45_000): void {
  setSchoolDashboardServerCached(key, value, ttlMs);
}

export function invalidateUserListServerCache(schoolId: string): void {
  // Keys are prefixed; dashboard cache has no prefix scan — TTL handles staleness.
  // Client cache is invalidated explicitly on mutations.
  void schoolId;
}
