const CACHE_PREFIX = "erp:student-list:v2";
const TTL_MS = 10 * 60 * 1000;

type CachedList<T> = { savedAt: number; items: T[] };

export type StudentListCacheScope = {
  status: "active" | "inactive" | "all";
  classId?: string;
  className?: string;
  section?: string;
  q?: string;
};

function cacheKey(scope: StudentListCacheScope): string {
  return `${CACHE_PREFIX}:${scope.status}:${scope.classId ?? ""}:${scope.className ?? ""}:${scope.section ?? ""}:${scope.q ?? ""}`;
}

export function readStudentListCache<T>(scope?: StudentListCacheScope): T[] | null {
  if (typeof sessionStorage === "undefined") return null;
  if (!scope) return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedList<T>;
    if (!parsed?.items?.length || Date.now() - parsed.savedAt > TTL_MS) {
      sessionStorage.removeItem(cacheKey(scope));
      return null;
    }
    return parsed.items;
  } catch {
    return null;
  }
}

export function writeStudentListCache<T>(items: T[], scope: StudentListCacheScope): void {
  if (typeof sessionStorage === "undefined" || items.length === 0) return;
  try {
    const payload: CachedList<T> = { savedAt: Date.now(), items };
    sessionStorage.setItem(cacheKey(scope), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

const LEGACY_LIST_KEY = "erp:student-details:list:v1";

export function clearStudentListCache(): void {
  if (typeof sessionStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => sessionStorage.removeItem(k));
  sessionStorage.removeItem(LEGACY_LIST_KEY);
}

/** @deprecated Profile dropdown uses a generic list — do not use for students table counts. */
export function readStudentListCacheLegacy<T>(): T[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LEGACY_LIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedList<T>;
    if (!parsed?.items?.length || Date.now() - parsed.savedAt > TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

export function writeStudentListCacheLegacy<T>(items: T[]): void {
  if (typeof sessionStorage === "undefined" || items.length === 0) return;
  try {
    sessionStorage.setItem(
      LEGACY_LIST_KEY,
      JSON.stringify({ savedAt: Date.now(), items } satisfies CachedList<T>)
    );
  } catch {
    /* quota */
  }
}
