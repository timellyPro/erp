type Cached = { freshUntil: number; value: unknown };

const cache = new Map<string, Cached>();

export function getParentPortalServerCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || Date.now() >= hit.freshUntil) {
    if (hit) cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setParentPortalServerCached(key: string, value: unknown, ttlMs = 120_000): void {
  cache.set(key, { value, freshUntil: Date.now() + ttlMs });
}

export function invalidateParentPortalServerCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
