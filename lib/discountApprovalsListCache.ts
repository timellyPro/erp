const approvalsCache = new Map<string, { expiresAt: number; approvals: unknown[] }>();

export const DISCOUNT_APPROVALS_CACHE_TTL_MS = 20_000;

export function getDiscountApprovalsListCached(key: string): unknown[] | null {
  const hit = approvalsCache.get(key);
  if (!hit || Date.now() >= hit.expiresAt) {
    if (hit) approvalsCache.delete(key);
    return null;
  }
  return hit.approvals;
}

export function setDiscountApprovalsListCached(
  key: string,
  approvals: unknown[],
  ttlMs = DISCOUNT_APPROVALS_CACHE_TTL_MS
): void {
  approvalsCache.set(key, { approvals, expiresAt: Date.now() + ttlMs });
}

export function invalidateDiscountApprovalsListCache(schoolId?: string | null): void {
  if (!schoolId) {
    approvalsCache.clear();
    return;
  }
  for (const key of approvalsCache.keys()) {
    if (key.startsWith(`${schoolId}:`)) approvalsCache.delete(key);
  }
}
