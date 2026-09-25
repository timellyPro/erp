type Entry = { freshUntil: number; staleUntil: number; value: unknown };

const store = new Map<string, Entry>();

/** Fast in-process cache when Redis/DB are slow (per Node worker). */
export function apiMemGet<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.staleUntil) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

/** Return cached value even if past freshUntil but before staleUntil (SWR). */
export function apiMemGetSwr<T>(key: string): { value: T; stale: boolean } | null {
  const hit = store.get(key);
  if (!hit || Date.now() >= hit.staleUntil) {
    if (hit) store.delete(key);
    return null;
  }
  return { value: hit.value as T, stale: Date.now() >= hit.freshUntil };
}

export function apiMemSet(key: string, value: unknown, freshMs: number, staleMs?: number): void {
  const now = Date.now();
  store.set(key, {
    value,
    freshUntil: now + freshMs,
    staleUntil: now + (staleMs ?? freshMs * 3),
  });
  if (store.size > 800) {
    const oldest = [...store.entries()].sort((a, b) => a[1].freshUntil - b[1].freshUntil).slice(0, 200);
    oldest.forEach(([k]) => store.delete(k));
  }
}

export function apiMemDeletePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
