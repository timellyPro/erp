import type { StudentCredentialsPayload } from "@/lib/computeStudentCredentials";

const MEMORY_TTL_MS = 90_000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_KEY = "erp:student-credentials:v1";

const memory = new Map<string, { expiresAt: number; value: StudentCredentialsPayload }>();
const inflight = new Map<string, Promise<StudentCredentialsPayload>>();

type SessionStore = Record<string, { savedAt: number; value: StudentCredentialsPayload }>;

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
    if (keys.length > 12) {
      keys
        .sort((a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0))
        .slice(12)
        .forEach((k) => delete store[k]);
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export type CredentialsFilterKey = {
  schoolId: string;
  classId?: string;
  className?: string;
  section?: string;
};

export function credentialsCacheKey(filters: CredentialsFilterKey): string {
  const { schoolId, classId = "", className = "", section = "" } = filters;
  return `${schoolId}:${classId}:${className}:${section}`;
}

export function getStudentCredentialsCached(
  key: string
): StudentCredentialsPayload | null {
  const mem = memory.get(key);
  if (mem && Date.now() < mem.expiresAt) return mem.value;

  const store = readSession();
  const entry = store[key];
  if (!entry || Date.now() - entry.savedAt > SESSION_TTL_MS) {
    if (entry) {
      delete store[key];
      writeSession(store);
    }
    return null;
  }
  return entry.value;
}

export function peekStudentCredentials(filters: CredentialsFilterKey): StudentCredentialsPayload | null {
  return getStudentCredentialsCached(credentialsCacheKey(filters));
}

export function setStudentCredentialsCached(
  key: string,
  value: StudentCredentialsPayload
): void {
  memory.set(key, { value, expiresAt: Date.now() + MEMORY_TTL_MS });
  const store = readSession();
  store[key] = { savedAt: Date.now(), value };
  writeSession(store);
}

export function invalidateStudentCredentialsCache(schoolId?: string): void {
  if (!schoolId) {
    memory.clear();
    inflight.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  const prefix = `${schoolId}:`;
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
  const store = readSession();
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) delete store[key];
  }
  writeSession(store);
}

function buildQuery(filters: CredentialsFilterKey): string {
  const params = new URLSearchParams();
  if (filters.classId) params.set("classId", filters.classId);
  else {
    if (filters.className) params.set("className", filters.className);
    if (filters.section) params.set("section", filters.section);
  }
  return params.toString();
}

export async function fetchStudentCredentials(
  filters: CredentialsFilterKey,
  options?: { signal?: AbortSignal; revalidate?: boolean }
): Promise<StudentCredentialsPayload> {
  const key = credentialsCacheKey(filters);

  if (!options?.revalidate) {
    const cached = getStudentCredentialsCached(key);
    if (cached) return cached;
  }

  const running = inflight.get(key);
  if (running) return running;

  const run = (async () => {
    const qs = buildQuery(filters);
    const res = await fetch(`/api/student/credentials${qs ? `?${qs}` : ""}`, {
      credentials: "include",
      cache: "no-store",
      signal: options?.signal,
    });
    const data = (await res.json()) as StudentCredentialsPayload & { message?: string };
    if (!res.ok) {
      throw new Error(data.message || "Failed to load credentials");
    }
    setStudentCredentialsCached(key, data);
    return data;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}
