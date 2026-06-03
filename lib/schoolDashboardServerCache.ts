type Cached = { freshUntil: number; value: unknown };

const cache = new Map<string, Cached>();

export function getSchoolDashboardServerCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || Date.now() >= hit.freshUntil) {
    if (hit) cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setSchoolDashboardServerCached(key: string, value: unknown, ttlMs = 20_000): void {
  cache.set(key, { value, freshUntil: Date.now() + ttlMs });
}
