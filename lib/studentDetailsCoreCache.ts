import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";
import type { StudentDetailsTabPayload } from "@/lib/buildStudentDetailsTabPayload";

export type StudentDetailsCoreCacheValue = {
  shell: StudentDetailsTabPayload;
  feeBreakdown: AdminStudentFeeBreakdownResult | null;
};

const coreBundleCache = new Map<string, { freshUntil: number; value: StudentDetailsCoreCacheValue }>();
export const CORE_BUNDLE_TTL_MS = 300_000;

export function getStudentDetailsCoreCached(
  cacheKey: string
): StudentDetailsCoreCacheValue | null {
  const hit = coreBundleCache.get(cacheKey);
  if (!hit || Date.now() >= hit.freshUntil) {
    if (hit) coreBundleCache.delete(cacheKey);
    return null;
  }
  return hit.value;
}

export function setStudentDetailsCoreCached(
  cacheKey: string,
  value: StudentDetailsCoreCacheValue
): void {
  coreBundleCache.set(cacheKey, { value, freshUntil: Date.now() + CORE_BUNDLE_TTL_MS });
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
