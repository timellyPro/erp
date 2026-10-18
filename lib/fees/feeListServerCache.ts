import {
  getSchoolDashboardServerCached,
  purgeSchoolDashboardServerCacheMatching,
  setSchoolDashboardServerCached,
} from "@/lib/school/schoolDashboardServerCache";
import { bumpTenantCacheVersion, getTenantCacheVersion } from "@/lib/cache/redis";

/**
 * TTL for the school-wide fee lists (`/api/fees/summary` stats + `/api/fees/records`).
 * Long enough that repeat opens skip the DB round trips (the tenant scope alone costs
 * ~2s on a remote DB); safe only because every fee write calls
 * `invalidateFeeListServerCaches` below.
 */
export const FEE_LIST_SERVER_CACHE_TTL_MS = 120_000;

/**
 * Per-school "fee data version". The in-memory caches above live in each server process, so a
 * write handled by one server cannot purge the others. Every fee write bumps this counter (in
 * Redis when configured, otherwise in-process) and the cached fee lists store the version they
 * were built from, so a stale entry is ignored by every server within the Redis sync window
 * (REDIS_VERSION_SYNC_MS, 2s by default) instead of living for its full TTL.
 */
const feeScope = (schoolId: string) => `fees:${schoolId}`;

const MAX_TRACKED_ENTRIES = 5000;
const entryVersions = new Map<string, number>();

/** Read this BEFORE querying the data, so a write that lands mid-request is not cached as fresh. */
export function getFeeCacheVersion(schoolId: string): Promise<number> {
  return getTenantCacheVersion(feeScope(schoolId));
}

/** Cached value for `key`, or null if missing or built from an older fee-data version. */
export function getFeeCached<T>(key: string, version: number): T | null {
  const hit = getSchoolDashboardServerCached<T>(key);
  if (hit === null || hit === undefined) {
    entryVersions.delete(key);
    return null;
  }
  const builtFrom = entryVersions.get(key);
  if (builtFrom !== undefined && builtFrom !== version) {
    entryVersions.delete(key);
    purgeSchoolDashboardServerCacheMatching(key);
    return null;
  }
  return hit;
}

export function setFeeCached(key: string, value: unknown, ttlMs: number, version: number): void {
  if (entryVersions.size >= MAX_TRACKED_ENTRIES) {
    const oldest = entryVersions.keys().next().value;
    if (oldest !== undefined) {
      entryVersions.delete(oldest);
      purgeSchoolDashboardServerCacheMatching(oldest);
    }
  }
  entryVersions.set(key, version);
  setSchoolDashboardServerCached(key, value, ttlMs);
}

/**
 * Drop the in-memory fee caches for one school and bump its fee-data version so other servers
 * drop theirs too. Call after any fee/payment write.
 */
export function invalidateFeeListServerCaches(schoolId: string | null | undefined): void {
  if (!schoolId) return;
  purgeSchoolDashboardServerCacheMatching(`fees:summary:stats:active:${schoolId}`);
  purgeSchoolDashboardServerCacheMatching(`fees:summary:page:active:${schoolId}:`);
  purgeSchoolDashboardServerCacheMatching(`fees:records:v3:${schoolId}:`);
  purgeSchoolDashboardServerCacheMatching(`fees:transactions:${schoolId}:`);
  purgeSchoolDashboardServerCacheMatching(`fees:report:${schoolId}:`);
  purgeSchoolDashboardServerCacheMatching(`fees:extra:${schoolId}`);
  purgeSchoolDashboardServerCacheMatching(`fees:structure:${schoolId}`);
  // Never block the API response on Redis.
  void bumpTenantCacheVersion(feeScope(schoolId)).catch(() => {});
}
