const MEMORY_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_KEY = "erp:parent-portal:v1";
const LAST_STUDENT_KEY = "erp:parent-portal:last-student";

const memory = new Map<string, { expiresAt: number; savedAt: number; value: unknown }>();

type SessionStore = Record<string, { savedAt: number; value: unknown }>;

function readSession(): SessionStore {
  if (typeof sessionStorage === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as SessionStore;
  } catch {
    return {};
  }
}

function writeSession(store: SessionStore): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys = Object.keys(store);
    if (keys.length > 30) {
      keys
        .sort((a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0))
        .slice(30)
        .forEach((k) => delete store[k]);
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function parentCacheKey(studentId: string, resource: string, params = ""): string {
  return `${studentId}:${resource}${params ? `:${params}` : ""}`;
}

export type ParentCacheHit<T> = { value: T; savedAt: number; fromSession: boolean };

export function getParentPortalCachedEntry<T>(key: string): ParentCacheHit<T> | null {
  const mem = memory.get(key);
  if (mem && Date.now() < mem.expiresAt) {
    return { value: mem.value as T, savedAt: mem.savedAt, fromSession: false };
  }

  const store = readSession();
  const entry = store[key];
  if (!entry || Date.now() - entry.savedAt > SESSION_TTL_MS) {
    if (entry) {
      delete store[key];
      writeSession(store);
    }
    return null;
  }

  memory.set(key, {
    value: entry.value,
    savedAt: entry.savedAt,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
  return { value: entry.value as T, savedAt: entry.savedAt, fromSession: true };
}

export function getParentPortalCached<T>(key: string): T | null {
  return getParentPortalCachedEntry<T>(key)?.value ?? null;
}

export function setParentPortalCached(key: string, value: unknown): void {
  const savedAt = Date.now();
  memory.set(key, { value, savedAt, expiresAt: savedAt + MEMORY_TTL_MS });
  const store = readSession();
  store[key] = { savedAt, value };
  writeSession(store);
  const studentId = key.split(":")[0];
  if (studentId && studentId !== "anon") {
    try {
      sessionStorage?.setItem(LAST_STUDENT_KEY, studentId);
    } catch {
      /* ignore */
    }
  }
}

/** Instant paint before network (uses last known student). */
export function peekParentPortalAny<T>(resource: string, params = ""): T | null {
  const anonKey = parentCacheKey("anon", resource, params);
  const anon = getParentPortalCached<T>(anonKey);
  if (anon) return anon;

  if (typeof sessionStorage === "undefined") return null;
  try {
    const studentId = sessionStorage.getItem(LAST_STUDENT_KEY);
    if (!studentId) return null;
    return getParentPortalCached<T>(parentCacheKey(studentId, resource, params));
  } catch {
    return null;
  }
}

export function hasParentPortalCache(key: string): boolean {
  return getParentPortalCachedEntry(key) !== null;
}

export function invalidateParentPortalClientCache(studentId?: string): void {
  if (!studentId) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  for (const key of memory.keys()) {
    if (key.startsWith(`${studentId}:`)) memory.delete(key);
  }
  const store = readSession();
  for (const key of Object.keys(store)) {
    if (key.startsWith(`${studentId}:`)) delete store[key];
  }
  writeSession(store);
}
