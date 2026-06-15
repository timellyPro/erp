export type SchoolDashboardPayload = {
  stats: {
    totalClasses: number;
    totalClassesChange: number;
    totalStudents: number;
    totalStudentsChange: number;
    totalTeachers: number;
    totalTeachersChange: number;
    upcomingWorkshops: number;
    workshopsThisWeek: number;
    feesCollected: string;
    feesCollectedPct: number;
    todayCollectionTotal: string;
    todayCollectionTotalRaw: number;
  };
  attendance: {
    present: number;
    absent: number;
    late: number;
    total: number;
    overallRate: number;
    presentPct: string;
    absentPct: string;
    latePct: string;
  };
  workshops: Array<{
    id: string;
    title: string;
    date?: string;
    participants: number;
    status: string;
  }>;
  todayCollectionByMethod: Array<{
    key: string;
    label: string;
    amount: number;
    formattedAmount: string;
    count: number;
  }>;
  todayCollectionAdmission?: {
    amount: number;
    formattedAmount: string;
    count: number;
  };
  todayCollectionByHead?: {
    rows: Array<{
      key: string;
      label: string;
      amount: number;
      formattedAmount: string;
    }>;
    total: number;
    formattedTotal: string;
  };
  collectionDate?: string;
  teachersOnLeave: Array<{
    id: string;
    name: string;
    subject: string;
    leaveType: string;
    status: string;
    days: number;
  }>;
  recentActivities: Array<{
    type: string;
    title: string;
    subtitle: string;
    meta: string;
  }>;
  latestNews: Array<{
    id: string;
    title: string;
    description: string;
    postedBy: string;
    createdAt: string;
  }>;
};

const MEMORY_TTL_MS = 90_000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const SESSION_KEY = "erp:school-dashboard:v1";
const LAST_SCHOOL_KEY = "erp:school-dashboard:last-school";

const memory = new Map<string, { expiresAt: number; value: SchoolDashboardPayload }>();

type SessionStore = Record<string, { savedAt: number; value: SchoolDashboardPayload }>;

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
    if (keys.length > 5) {
      keys
        .sort((a, b) => (store[b]?.savedAt ?? 0) - (store[a]?.savedAt ?? 0))
        .slice(5)
        .forEach((k) => delete store[k]);
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function dashboardCacheKey(schoolId: string, dateYmd: string): string {
  return `${schoolId}:${dateYmd}`;
}

export function getSchoolDashboardCached(key: string): SchoolDashboardPayload | null {
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

export function setSchoolDashboardCached(key: string, value: SchoolDashboardPayload): void {
  memory.set(key, { value, expiresAt: Date.now() + MEMORY_TTL_MS });
  const store = readSession();
  store[key] = { savedAt: Date.now(), value };
  writeSession(store);
  const schoolId = key.split(":")[0];
  if (schoolId && schoolId !== "anon") {
    try {
      sessionStorage?.setItem(LAST_SCHOOL_KEY, schoolId);
    } catch {
      /* ignore */
    }
  }
}

/** Instant paint before session hydrates (uses last known school). */
export function peekSchoolDashboardAny(dateYmd: string): SchoolDashboardPayload | null {
  const anon = getSchoolDashboardCached(`anon:${dateYmd}`);
  if (anon) return anon;

  if (typeof sessionStorage === "undefined") return null;
  try {
    const schoolId = sessionStorage.getItem(LAST_SCHOOL_KEY);
    if (!schoolId) return null;
    return getSchoolDashboardCached(dashboardCacheKey(schoolId, dateYmd));
  } catch {
    return null;
  }
}

export function invalidateSchoolDashboardCache(schoolId?: string): void {
  if (!schoolId) {
    memory.clear();
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  for (const key of memory.keys()) {
    if (key.startsWith(`${schoolId}:`)) memory.delete(key);
  }
  const store = readSession();
  for (const key of Object.keys(store)) {
    if (key.startsWith(`${schoolId}:`)) delete store[key];
  }
  writeSession(store);
}
