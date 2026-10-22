import type { AdminStudentFeeBreakdownResult } from "@/lib/fees/computeAdminStudentFeeBreakdown";
import type { StudentDetailsTabPayload } from "@/lib/students/buildStudentDetailsTabPayload";

export type StudentDetailsCoreCacheValue = {
  shell: StudentDetailsTabPayload;
  feeBreakdown: AdminStudentFeeBreakdownResult | null;
};

const coreBundleCache = new Map<
  string,
  { freshUntil: number; value: StudentDetailsCoreCacheValue; version: number | null }
>();
export const CORE_BUNDLE_TTL_MS = 300_000;

export function getStudentDetailsCoreCached(
  cacheKey: string,
  feeVersion?: number | null
): StudentDetailsCoreCacheValue | null {
  const hit = coreBundleCache.get(cacheKey);
  if (!hit || Date.now() >= hit.freshUntil || (feeVersion != null && hit.version !== feeVersion)) {
    if (hit) coreBundleCache.delete(cacheKey);
    return null;
  }
  return hit.value;
}

export function setStudentDetailsCoreCached(
  cacheKey: string,
  value: StudentDetailsCoreCacheValue,
  feeVersion: number | null = null
): void {
  coreBundleCache.set(cacheKey, { value, freshUntil: Date.now() + CORE_BUNDLE_TTL_MS, version: feeVersion });
}

export function invalidateStudentDetailsCoreCache(studentId?: string, schoolId?: string | null) {
  if (!studentId) {
    coreBundleCache.clear();
    return;
  }
  const prefix = `${schoolId ?? "own"}:${studentId}:`;
  for (const key of coreBundleCache.keys()) {
    if (key.startsWith(prefix)) coreBundleCache.delete(key);
  }
}
