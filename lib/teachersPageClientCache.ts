export type TeacherApiRow = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  teacherId: string | null;
  subject: string | null;
  photoUrl: string | null;
};

export type TeacherAttendanceEntry = { teacherId: string; status: string };

type ResourceEntry<T> = { savedAt: number; value: T };
type SessionStore = {
  teacherList?: ResourceEntry<TeacherApiRow[]>;
  attendanceByDate?: Record<string, ResourceEntry<TeacherAttendanceEntry[]>>;
  appointData?: ResourceEntry<{
    classes: unknown[];
    teachers: TeacherApiRow[];
  }>;
};

const MEMORY_TTL_MS = 90_000;
const SESSION_TTL_MS = 20 * 60 * 1000;
const SESSION_KEY = "erp:teachers-page:v2";
const LAST_SCHOOL_KEY = "erp:teachers-page:last-school";

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

export function getLastTeachersSchoolId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(LAST_SCHOOL_KEY);
  } catch {
    return null;
  }
}

export function peekTeachersList(schoolId: string): TeacherApiRow[] | null {
  const mem = memGet<TeacherApiRow[]>(`list:${schoolId}`);
  if (mem) return mem;
  const entry = readSession(schoolId).teacherList;
  return fresh(entry) ? entry!.value : null;
}

/** Instant paint before session hydrates (uses last known school). */
export function peekTeachersListAny(): TeacherApiRow[] | null {
  const schoolId = getLastTeachersSchoolId();
  return schoolId ? peekTeachersList(schoolId) : null;
}

export function setTeachersListCache(schoolId: string, teachers: TeacherApiRow[]): void {
  memSet(`list:${schoolId}`, teachers);
  const store = readSession(schoolId);
  store.teacherList = { savedAt: Date.now(), value: teachers };
  writeSession(schoolId, store);
}

export function peekTeacherAttendance(schoolId: string, date: string): TeacherAttendanceEntry[] | null {
  const mem = memGet<TeacherAttendanceEntry[]>(`att:${schoolId}:${date}`);
  if (mem) return mem;
  const entry = readSession(schoolId).attendanceByDate?.[date];
  return fresh(entry) ? entry!.value : null;
}

/** Instant paint before session hydrates (uses last known school). */
export function peekTeacherAttendanceAny(date: string): TeacherAttendanceEntry[] | null {
  const schoolId = getLastTeachersSchoolId();
  return schoolId ? peekTeacherAttendance(schoolId, date) : null;
}

export function setTeacherAttendanceCache(
  schoolId: string,
  date: string,
  attendances: TeacherAttendanceEntry[]
): void {
  memSet(`att:${schoolId}:${date}`, attendances);
  const store = readSession(schoolId);
  store.attendanceByDate = {
    ...(store.attendanceByDate ?? {}),
    [date]: { savedAt: Date.now(), value: attendances },
  };
  writeSession(schoolId, store);
}

export function peekAppointTeacherData(schoolId: string): {
  classes: unknown[];
  teachers: TeacherApiRow[];
} | null {
  const mem = memGet<{ classes: unknown[]; teachers: TeacherApiRow[] }>(`appoint:${schoolId}`);
  if (mem) return mem;
  const entry = readSession(schoolId).appointData;
  return fresh(entry) ? entry!.value : null;
}

export function peekAppointTeacherDataAny(): {
  classes: unknown[];
  teachers: TeacherApiRow[];
} | null {
  const schoolId = getLastTeachersSchoolId();
  return schoolId ? peekAppointTeacherData(schoolId) : null;
}

export function setAppointTeacherDataCache(
  schoolId: string,
  value: { classes: unknown[]; teachers: TeacherApiRow[] }
): void {
  memSet(`appoint:${schoolId}`, value);
  const store = readSession(schoolId);
  store.appointData = { savedAt: Date.now(), value };
  writeSession(schoolId, store);
}

export function invalidateTeachersPageCache(schoolId?: string): void {
  if (!schoolId) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  for (const key of memory.keys()) {
    if (key.includes(schoolId)) memory.delete(key);
  }
  writeSession(schoolId, {});
}
