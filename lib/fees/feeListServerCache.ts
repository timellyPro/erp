import { purgeSchoolDashboardServerCacheMatching } from "@/lib/school/schoolDashboardServerCache";

/**
 * TTL for the school-wide fee lists (`/api/fees/summary` stats + `/api/fees/records`).
 * Long enough that repeat opens skip the DB round trips (the tenant scope alone costs
 * ~2s on a remote DB); safe only because every fee write calls
 * `invalidateFeeListServerCaches` below.
 */
export const FEE_LIST_SERVER_CACHE_TTL_MS = 120_000;

/** Drop the in-memory fee summary/records entries for one school. Call after any fee/payment write. */
export function invalidateFeeListServerCaches(schoolId: string | null | undefined): void {
  if (!schoolId) return;
  purgeSchoolDashboardServerCacheMatching(`fees:summary:stats:active:${schoolId}`);
  purgeSchoolDashboardServerCacheMatching(`fees:summary:page:active:${schoolId}:`);
  purgeSchoolDashboardServerCacheMatching(`fees:records:v3:${schoolId}:`);
}
