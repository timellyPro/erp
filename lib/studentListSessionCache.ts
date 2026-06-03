const CACHE_KEY = "erp:student-details:list:v1";
const TTL_MS = 10 * 60 * 1000;

type CachedList<T> = { savedAt: number; items: T[] };

export function readStudentListCache<T>(): T[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedList<T>;
    if (!parsed?.items?.length || Date.now() - parsed.savedAt > TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed.items;
  } catch {
    return null;
  }
}

export function writeStudentListCache<T>(items: T[]): void {
  if (typeof sessionStorage === "undefined" || items.length === 0) return;
  try {
    const payload: CachedList<T> = { savedAt: Date.now(), items };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function clearStudentListCache(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(CACHE_KEY);
}
