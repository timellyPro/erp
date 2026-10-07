const catalogMemCache = new Map<string, { freshUntil: number; value: unknown }>();

const DEFAULT_TTL_MS = 20_000;

export function getAssignCatalogMemCached(key: string): unknown | null {
  const hit = catalogMemCache.get(key);
  if (!hit || Date.now() >= hit.freshUntil) {
    if (hit) catalogMemCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setAssignCatalogMemCached(
  key: string,
  value: unknown,
  ttlMs = DEFAULT_TTL_MS
): void {
  catalogMemCache.set(key, { value, freshUntil: Date.now() + ttlMs });
}

/** Clear assign-fees picker cache after catalog templates or scoped extras change. */
export function invalidateAssignCatalogServerCache(schoolId?: string): void {
  if (!schoolId) {
    catalogMemCache.clear();
    return;
  }
  const prefix = `${schoolId}:`;
  for (const key of catalogMemCache.keys()) {
    if (key.startsWith(prefix)) catalogMemCache.delete(key);
  }
}
