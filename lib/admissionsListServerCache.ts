type CachedList = {
  freshUntil: number;
  body: unknown;
};

const cache = new Map<string, CachedList>();
const TTL_MS = 12_000;

export function admissionsListCacheKey(schoolId: string, queryString: string): string {
  return `${schoolId}:${queryString}`;
}

export function getAdmissionsListCached(key: string): unknown | null {
  const hit = cache.get(key);
  if (!hit || Date.now() >= hit.freshUntil) {
    if (hit) cache.delete(key);
    return null;
  }
  return hit.body;
}

export function setAdmissionsListCached(key: string, body: unknown): void {
  cache.set(key, { body, freshUntil: Date.now() + TTL_MS });
}

export function invalidateAdmissionsListCache(schoolId?: string): void {
  if (!schoolId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${schoolId}:`)) cache.delete(key);
  }
}
