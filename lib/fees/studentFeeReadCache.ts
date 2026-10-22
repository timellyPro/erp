import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { invalidateExtraFeesScopeCacheForStudent } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import { invalidateExtraFeesScopeCache } from "@/lib/fees/loadExtraFeesForStudentScope";
import type { StudentDetailsCoreCacheValue } from "@/lib/students/studentDetailsCoreCache";
import {
  CORE_BUNDLE_TTL_MS,
  getStudentDetailsCoreCached,
  invalidateStudentDetailsCoreCache,
  setStudentDetailsCoreCached,
} from "@/lib/students/studentDetailsCoreCache";
import { invalidateTenant } from "@/lib/cache/tenantCache";
import { invalidateFeeListServerCaches } from "@/lib/fees/feeListServerCache";
import { scheduleFeeDataVersionBump } from "@/lib/fees/feeDataVersion";

export { CORE_BUNDLE_TTL_MS, getStudentDetailsCoreCached, setStudentDetailsCoreCached };

const breakdownMemCache = new Map<
  string,
  { freshUntil: number; value: AdminStudentFeeBreakdownResult; version: number | null }
>();

const shellCache = new Map<string, { freshUntil: number; value: Record<string, unknown>; version: number | null }>();

/** A copy built at one fee-data version is a miss once the school's counter has moved (see feeDataVersion.ts). */
function versionMatches(stored: number | null, wanted: number | null | undefined): boolean {
  return wanted == null || stored === wanted;
}

export const BREAKDOWN_MEM_TTL_MS = 300_000;
export const SHELL_CACHE_TTL_MS = 300_000;

/** Bump when breakdown attribution changes so in-memory fast responses are dropped. */
const BREAKDOWN_MEM_VERSION = "v2";

export function getBreakdownMemCached(
  key: string,
  feeVersion?: number | null
): AdminStudentFeeBreakdownResult | null {
  const hit = breakdownMemCache.get(`${BREAKDOWN_MEM_VERSION}:${key}`);
  if (!hit || Date.now() >= hit.freshUntil || !versionMatches(hit.version, feeVersion)) {
    if (hit) breakdownMemCache.delete(`${BREAKDOWN_MEM_VERSION}:${key}`);
    return null;
  }
  return hit.value;
}

export function setBreakdownMemCached(
  key: string,
  value: AdminStudentFeeBreakdownResult,
  ttlMs = BREAKDOWN_MEM_TTL_MS,
  feeVersion: number | null = null
): void {
  breakdownMemCache.set(`${BREAKDOWN_MEM_VERSION}:${key}`, {
    value,
    freshUntil: Date.now() + ttlMs,
    version: feeVersion,
  });
}

export function getShellCached(key: string, feeVersion?: number | null): Record<string, unknown> | null {
  const hit = shellCache.get(key);
  if (!hit || Date.now() >= hit.freshUntil || !versionMatches(hit.version, feeVersion)) {
    if (hit) shellCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setShellCached(
  key: string,
  value: Record<string, unknown>,
  ttlMs = SHELL_CACHE_TTL_MS,
  feeVersion: number | null = null
): void {
  shellCache.set(key, { value, freshUntil: Date.now() + ttlMs, version: feeVersion });
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
  invalidateExtraFeesScopeCacheForStudent(studentId);
  if (schoolId) invalidateExtraFeesScopeCache(schoolId);

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
  invalidateFeeListServerCaches(schoolId);
  // Tell every other copy (other server processes, every browser) that fee data changed.
  if (schoolId) void scheduleFeeDataVersionBump(schoolId).catch(() => {});
  // Never block API responses on Redis — in-memory caches are already cleared.
  if (schoolId) void invalidateTenant(schoolId).catch(() => {});
}

/** Broad invalidation when class-wide fee structure changes. */
export function invalidateSchoolFeeReadCaches(schoolId: string): void {
  invalidateStudentDetailsCoreCache();
  invalidateExtraFeesScopeCacheForStudent();
  invalidateExtraFeesScopeCache(schoolId);
  breakdownMemCache.clear();
  shellCache.clear();
  invalidateFeeListServerCaches(schoolId);
  void scheduleFeeDataVersionBump(schoolId).catch(() => {});
  void invalidateTenant(schoolId).catch(() => {});
}
