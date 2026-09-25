import type { IUser } from "@/app/frontend/constants/addUserTable";

export type UserListPageResult = {
  users: IUser[];
  total: number;
  page: number;
  pageSize: number;
};

export type UserFormMeta = {
  classes: Array<{ id: string; name: string; section: string | null }>;
  emailDomain: string | null;
};

type ResourceEntry<T> = { savedAt: number; value: T };
type SessionStore = {
  listPages?: Record<string, ResourceEntry<UserListPageResult>>;
  formMeta?: ResourceEntry<UserFormMeta>;
  usersById?: Record<string, ResourceEntry<Record<string, unknown>>>;
};

const MEMORY_TTL_MS = 90_000;
const SESSION_TTL_MS = 20 * 60 * 1000;
const SESSION_KEY = "erp:add-user-page:v1";
const LAST_SCHOOL_KEY = "erp:add-user-page:last-school";

const memory = new Map<string, { expiresAt: number; value: unknown }>();

function fresh(entry?: ResourceEntry<unknown>): boolean {
  return Boolean(entry && Date.now() - entry.savedAt < SESSION_TTL_MS);
}

function readSession(schoolId: string): SessionStore {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const all = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Record<string, SessionStore>;
    return all[schoolId] ?? {};
  } catch {
    return {};
  }
}

function writeSession(schoolId: string, store: SessionStore): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const all = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Record<string, SessionStore>;
    all[schoolId] = store;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(all));
    sessionStorage.setItem(LAST_SCHOOL_KEY, schoolId);
  } catch {
    /* quota */
  }
}

export function peekLastAddUserSchoolId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(LAST_SCHOOL_KEY);
  } catch {
    return null;
  }
}

function memGet<T>(key: string): T | null {
  const hit = memory.get(key);
  if (!hit || Date.now() >= hit.expiresAt) {
    if (hit) memory.delete(key);
    return null;
  }
  return hit.value as T;
}

function memSet(key: string, value: unknown): void {
  memory.set(key, { value, expiresAt: Date.now() + MEMORY_TTL_MS });
}

export function listCacheKey(
  schoolId: string,
  page: number,
  pageSize: number,
  search: string,
  role: string
): string {
  return `${schoolId}:list:${page}:${pageSize}:${role}:${search.trim().toLowerCase()}`;
}

export function peekUserListPage(key: string): UserListPageResult | null {
  const mem = memGet<UserListPageResult>(`list:${key}`);
  if (mem) return mem;
  const schoolId = key.split(":")[0];
  if (!schoolId) return null;
  const entry = readSession(schoolId).listPages?.[key];
  return fresh(entry) ? entry!.value : null;
}

export function setUserListPageCache(key: string, value: UserListPageResult): void {
  memSet(`list:${key}`, value);
  const schoolId = key.split(":")[0];
  if (!schoolId) return;
  const store = readSession(schoolId);
  store.listPages = { ...(store.listPages ?? {}), [key]: { savedAt: Date.now(), value } };
  writeSession(schoolId, store);
}

export function peekUserFormMeta(schoolId: string): UserFormMeta | null {
  const mem = memGet<UserFormMeta>(`meta:${schoolId}`);
  if (mem) return mem;
  const entry = readSession(schoolId).formMeta;
  return fresh(entry) ? entry!.value : null;
}

export function setUserFormMetaCache(schoolId: string, value: UserFormMeta): void {
  memSet(`meta:${schoolId}`, value);
  const store = readSession(schoolId);
  store.formMeta = { savedAt: Date.now(), value };
  writeSession(schoolId, store);
}

export function peekUserById(schoolId: string, userId: string): Record<string, unknown> | null {
  const mem = memGet<Record<string, unknown>>(`user:${schoolId}:${userId}`);
  if (mem) return mem;
  const entry = readSession(schoolId).usersById?.[userId];
  return fresh(entry) ? entry!.value : null;
}

export function setUserByIdCache(schoolId: string, userId: string, value: Record<string, unknown>): void {
  memSet(`user:${schoolId}:${userId}`, value);
  const store = readSession(schoolId);
  store.usersById = { ...(store.usersById ?? {}), [userId]: { savedAt: Date.now(), value } };
  writeSession(schoolId, store);
}

export function invalidateAddUserPageCache(schoolId?: string): void {
  if (!schoolId) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  for (const key of memory.keys()) {
    if (key.includes(schoolId)) memory.delete(key);
  }
  const store = readSession(schoolId);
  store.listPages = {};
  store.usersById = {};
  writeSession(schoolId, store);
}
