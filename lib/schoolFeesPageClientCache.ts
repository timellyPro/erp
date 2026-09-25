import type { Class, ExtraFee, FeeRecord, FeeStructure, FeeSummary, Student } from "@/app/frontend/components/schooladmin/fees/types";

export type SchoolFeesPageSnapshot = {
  stats: FeeSummary | null;
  fees: FeeRecord[];
  feeRecords: FeeRecord[] | null;
  classes: Class[] | null;
  students: Student[] | null;
  structures: FeeStructure[] | null;
  extraFees: ExtraFee[] | null;
};

type ResourceEntry<T> = { savedAt: number; value: T };

type SessionStore = {
  stats?: ResourceEntry<{ stats: FeeSummary | null; fees: FeeRecord[] }>;
  feeRecords?: ResourceEntry<FeeRecord[]>;
  classes?: ResourceEntry<Class[]>;
  students?: ResourceEntry<Student[]>;
  structures?: ResourceEntry<FeeStructure[]>;
  extraFees?: ResourceEntry<ExtraFee[]>;
};

const MEMORY_TTL_MS = 90_000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_KEY = "erp:school-fees-page:v1";
const LAST_SCHOOL_KEY = "erp:school-fees-page:last-school";

const memory = new Map<string, { expiresAt: number; value: unknown }>();

function memKey(schoolId: string, resource: string): string {
  return `${schoolId}:${resource}`;
}

function readSession(schoolId: string): SessionStore {
  if (typeof sessionStorage === "undefined") return {};
  try {
    const all = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Record<
      string,
      SessionStore
    >;
    return all[schoolId] ?? {};
  } catch {
    return {};
  }
}

function writeSession(schoolId: string, store: SessionStore): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const all = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Record<
      string,
      SessionStore
    >;
    all[schoolId] = store;
    const keys = Object.keys(all);
    if (keys.length > 3) {
      keys.slice(0, keys.length - 3).forEach((k) => delete all[k]);
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(all));
    sessionStorage.setItem(LAST_SCHOOL_KEY, schoolId);
  } catch {
    /* quota */
  }
}

function fresh(entry?: ResourceEntry<unknown>): boolean {
  return Boolean(entry && Date.now() - entry.savedAt < SESSION_TTL_MS);
}

function rememberSchoolId(schoolId: string): void {
  try {
    sessionStorage?.setItem(LAST_SCHOOL_KEY, schoolId);
  } catch {
    /* ignore */
  }
}

export function peekLastFeesSchoolId(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(LAST_SCHOOL_KEY);
  } catch {
    return null;
  }
}

export function peekSchoolFeesSnapshot(schoolId: string): SchoolFeesPageSnapshot {
  const snap: SchoolFeesPageSnapshot = {
    stats: null,
    fees: [],
    feeRecords: null,
    classes: null,
    students: null,
    structures: null,
    extraFees: null,
  };

  const mStats = memory.get(memKey(schoolId, "stats"));
  if (mStats && Date.now() < mStats.expiresAt) {
    const v = mStats.value as { stats: FeeSummary | null; fees: FeeRecord[] };
    snap.stats = v.stats;
    snap.fees = v.fees;
  }

  const mFeeRecords = memory.get(memKey(schoolId, "feeRecords"));
  if (mFeeRecords && Date.now() < mFeeRecords.expiresAt) {
    snap.feeRecords = mFeeRecords.value as FeeRecord[];
  }

  for (const resource of ["classes", "students", "structures", "extraFees"] as const) {
    const m = memory.get(memKey(schoolId, resource));
    if (m && Date.now() < m.expiresAt) {
      snap[resource] = m.value as never;
    }
  }

  const session = readSession(schoolId);
  if (!snap.stats && fresh(session.stats)) {
    snap.stats = session.stats!.value.stats;
    snap.fees = session.stats!.value.fees;
  }
  if (snap.feeRecords === null && fresh(session.feeRecords)) snap.feeRecords = session.feeRecords!.value;
  if (snap.classes === null && fresh(session.classes)) snap.classes = session.classes!.value;
  if (snap.students === null && fresh(session.students)) snap.students = session.students!.value;
  if (snap.structures === null && fresh(session.structures)) snap.structures = session.structures!.value;
  if (snap.extraFees === null && fresh(session.extraFees)) snap.extraFees = session.extraFees!.value;

  return snap;
}

export function setSchoolFeesFeeRecordsCache(schoolId: string, feeRecords: FeeRecord[]): void {
  memory.set(memKey(schoolId, "feeRecords"), {
    value: feeRecords,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
  const store = readSession(schoolId);
  store.feeRecords = { savedAt: Date.now(), value: feeRecords };
  writeSession(schoolId, store);
  rememberSchoolId(schoolId);
}

export function setSchoolFeesStatsCache(
  schoolId: string,
  stats: FeeSummary | null,
  fees: FeeRecord[]
): void {
  const value = { stats, fees };
  memory.set(memKey(schoolId, "stats"), { value, expiresAt: Date.now() + MEMORY_TTL_MS });
  const store = readSession(schoolId);
  store.stats = { savedAt: Date.now(), value };
  writeSession(schoolId, store);
  rememberSchoolId(schoolId);
}

export function setSchoolFeesClassesCache(schoolId: string, classes: Class[]): void {
  memory.set(memKey(schoolId, "classes"), { value: classes, expiresAt: Date.now() + MEMORY_TTL_MS });
  const store = readSession(schoolId);
  store.classes = { savedAt: Date.now(), value: classes };
  writeSession(schoolId, store);
  rememberSchoolId(schoolId);
}

export function setSchoolFeesStudentsCache(schoolId: string, students: Student[]): void {
  memory.set(memKey(schoolId, "students"), { value: students, expiresAt: Date.now() + MEMORY_TTL_MS });
  const store = readSession(schoolId);
  store.students = { savedAt: Date.now(), value: students };
  writeSession(schoolId, store);
  rememberSchoolId(schoolId);
}

export function setSchoolFeesStructuresCache(schoolId: string, structures: FeeStructure[]): void {
  memory.set(memKey(schoolId, "structures"), {
    value: structures,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
  const store = readSession(schoolId);
  store.structures = { savedAt: Date.now(), value: structures };
  writeSession(schoolId, store);
  rememberSchoolId(schoolId);
}

export function setSchoolFeesExtraFeesCache(schoolId: string, extraFees: ExtraFee[]): void {
  memory.set(memKey(schoolId, "extraFees"), {
    value: extraFees,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });
  const store = readSession(schoolId);
  store.extraFees = { savedAt: Date.now(), value: extraFees };
  writeSession(schoolId, store);
  rememberSchoolId(schoolId);
}

export function invalidateSchoolFeesPageCache(schoolId?: string): void {
  if (!schoolId) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  for (const key of memory.keys()) {
    if (key.startsWith(`${schoolId}:`)) memory.delete(key);
  }
  if (typeof sessionStorage === "undefined") return;
  try {
    const all = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}") as Record<
      string,
      SessionStore
    >;
    delete all[schoolId];
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
