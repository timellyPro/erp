type ResourceEntry<T> = { savedAt: number; value: T };
type SessionStore = Record<string, ResourceEntry<unknown>>;

const MEMORY_TTL_MS = 90_000;
const SESSION_TTL_MS = 20 * 60 * 1000;
const SESSION_KEY = "erp:schooladmin-fast-tabs:v2";

const memory = new Map<string, { expiresAt: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

function now() {
  return Date.now();
}

function cacheKey(namespace: string, key: string) {
  return `${namespace}:${key}`;
}

function isFresh(entry?: ResourceEntry<unknown>): boolean {
  return Boolean(entry && now() - entry.savedAt < SESSION_TTL_MS);
}

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
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function peekSchoolAdminResource<T>(namespace: string, key = "default"): T | null {
  const fullKey = cacheKey(namespace, key);
  const mem = memory.get(fullKey);
  if (mem && now() < mem.expiresAt) return mem.value as T;
  if (mem) memory.delete(fullKey);

  const entry = readSession()[fullKey];
  return isFresh(entry) ? (entry!.value as T) : null;
}

export function setSchoolAdminResource<T>(namespace: string, key: string, value: T): void {
  const fullKey = cacheKey(namespace, key);
  memory.set(fullKey, { value, expiresAt: now() + MEMORY_TTL_MS });
  const store = readSession();
  store[fullKey] = { savedAt: now(), value };
  writeSession(store);
}

export function invalidateSchoolAdminResource(namespace: string, key?: string): void {
  const prefix = key ? cacheKey(namespace, key) : `${namespace}:`;
  for (const memKey of memory.keys()) {
    if (memKey === prefix || memKey.startsWith(prefix)) memory.delete(memKey);
  }
  const store = readSession();
  for (const sessionKey of Object.keys(store)) {
    if (sessionKey === prefix || sessionKey.startsWith(prefix)) delete store[sessionKey];
  }
  writeSession(store);
}

export async function loadSchoolAdminResource<T>(
  namespace: string,
  key: string,
  loader: () => Promise<T>,
  options?: { revalidate?: boolean }
): Promise<T> {
  if (!options?.revalidate) {
    const cached = peekSchoolAdminResource<T>(namespace, key);
    if (cached) return cached;
  }

  const fullKey = cacheKey(namespace, key);
  const running = inflight.get(fullKey);
  if (running) return running as Promise<T>;

  const run = loader().then((value) => {
    setSchoolAdminResource(namespace, key, value);
    return value;
  });
  inflight.set(fullKey, run);
  try {
    return await run;
  } finally {
    inflight.delete(fullKey);
  }
}
