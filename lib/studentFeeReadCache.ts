import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";
import type { StudentDetailsCoreCacheValue } from "@/lib/studentDetailsCoreCache";
import {
  CORE_BUNDLE_TTL_MS,
  getStudentDetailsCoreCached,
  invalidateStudentDetailsCoreCache,
  setStudentDetailsCoreCached,
} from "@/lib/studentDetailsCoreCache";
import { invalidateTenant } from "@/lib/tenantCache";

export { CORE_BUNDLE_TTL_MS, getStudentDetailsCoreCached, setStudentDetailsCoreCached };

const breakdownMemCache = new Map<
  string,
  { freshUntil: number; value: AdminStudentFeeBreakdownResult }
>();

const shellCache = new Map<string, { freshUntil: number; value: Record<string, unknown> }>();

export const BREAKDOWN_MEM_TTL_MS = 300_000;
export const SHELL_CACHE_TTL_MS = 300_000;

export function getBreakdownMemCached(
  key: string
): AdminStudentFeeBreakdownResult | null {
  const hit = breakdownMemCache.get(key);
  if (!hit || Date.now() >= hit.freshUntil) {
    if (hit) breakdownMemCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setBreakdownMemCached(
  key: string,
  value: AdminStudentFeeBreakdownResult,
  ttlMs = BREAKDOWN_MEM_TTL_MS
): void {
  breakdownMemCache.set(key, { value, freshUntil: Date.now() + ttlMs });
}

export function getShellCached(key: string): Record<string, unknown> | null {
  const hit = shellCache.get(key);
  if (!hit || Date.now() >= hit.freshUntil) {
    if (hit) shellCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setShellCached(
  key: string,
  value: Record<string, unknown>,
  ttlMs = SHELL_CACHE_TTL_MS
): void {
  shellCache.set(key, { value, freshUntil: Date.now() + ttlMs });
}

function deleteKeysWithPrefix(map: Map<string, unknown>, prefix: string): void {
  for (const key of map.keys()) {
    if (key.startsWith(prefix)) map.delete(key);
  }
}

function invalidateStudentFeeReadCachesSync(options: {
  studentId: string;
  schoolId?: string | null;
}): void {
  const { studentId, schoolId = null } = options;
  const schoolPrefix = schoolId ? `${schoolId}:` : null;

  invalidateStudentDetailsCoreCache(studentId, schoolId);

  for (const key of breakdownMemCache.keys()) {
    if (key.endsWith(`:${studentId}:fast`)) breakdownMemCache.delete(key);
    else if (schoolPrefix && key.startsWith(`${schoolPrefix}${studentId}:`)) {
      breakdownMemCache.delete(key);
    }
  }

  deleteKeysWithPrefix(shellCache as Map<string, unknown>, `${schoolId ?? "own"}:${studentId}:`);
}

/** Drop read caches after fee payments, structure edits, or extra-fee changes. */
export function invalidateStudentFeeReadCaches(options: {
  studentId: string;
  schoolId?: string | null;
}): void {
  const { schoolId = null } = options;
  invalidateStudentFeeReadCachesSync(options);
  // Never block API responses on Redis — in-memory caches are already cleared.
  if (schoolId) void invalidateTenant(schoolId).catch(() => {});
}

/** Broad invalidation when class-wide fee structure changes. */
export function invalidateSchoolFeeReadCaches(schoolId: string): void {
  invalidateStudentDetailsCoreCache();
  breakdownMemCache.clear();
  shellCache.clear();
  void invalidateTenant(schoolId).catch(() => {});
}
