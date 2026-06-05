import type { AdminStudentFeeBreakdownResult } from "@/lib/computeAdminStudentFeeBreakdown";
import type { StudentDetailsTabExtras, StudentDetailsTabPayload } from "@/lib/buildStudentDetailsTabPayload";
import { invalidateStudentDetailsCoreCache } from "@/lib/studentDetailsCoreCache";
import {
  fetchFeeBreakdownFast,
  getFeeBreakdownCached,
  invalidateFeeBreakdownCache,
  setFeeBreakdownCache,
} from "@/lib/feeBreakdownClientCache";

export type StudentDetailsFastBundle = StudentDetailsTabPayload & {
  feeBreakdown: AdminStudentFeeBreakdownResult | null;
};

const bundleMemory = new Map<string, { expiresAt: number; value: StudentDetailsFastBundle }>();
const bundleInflight = new Map<string, Promise<StudentDetailsFastBundle>>();
const extrasInflight = new Map<string, Promise<StudentDetailsTabExtras>>();

const BUNDLE_TTL_MS = 30 * 60 * 1000;
const SESSION_KEY = "erp:student-details-bundle:v2";
const SESSION_TTL_MS = 30 * 60 * 1000;

type SessionStore = Record<string, { savedAt: number; value: StudentDetailsFastBundle }>;

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

function readSessionBundle(studentId: string): StudentDetailsFastBundle | null {
  const store = readSession();
  const entry = store[studentId];
  if (!entry || Date.now() - entry.savedAt > SESSION_TTL_MS) {
    if (entry) {
      delete store[studentId];
      writeSession(store);
    }
    return null;
  }
  return entry.value;
}

function writeSessionBundle(studentId: string, value: StudentDetailsFastBundle): void {
  const store = readSession();
  store[studentId] = { savedAt: Date.now(), value };
  writeSession(store);
}

function parseCore(data: unknown): { shell: StudentDetailsTabPayload; feeBreakdown: AdminStudentFeeBreakdownResult | null } {
  if (!(data as { student?: unknown })?.student) {
    throw new Error("Invalid student details response");
  }
  const shell = parseShell(data);
  const feeBreakdown =
    (data as { feeBreakdown?: AdminStudentFeeBreakdownResult | null }).feeBreakdown ?? null;
  return { shell, feeBreakdown };
}

function parseShell(data: unknown): StudentDetailsTabPayload {
  const payload = data as StudentDetailsTabPayload;
  return {
    ...payload,
    payments: payload.payments ?? [],
    attendanceTrends: payload.attendanceTrends ?? [],
    academicPerformance: payload.academicPerformance ?? [],
    certificates: payload.certificates ?? [],
  };
}

function parseExtras(data: unknown): StudentDetailsTabExtras {
  const d = data as StudentDetailsTabExtras;
  return {
    payments: d.payments ?? [],
    attendanceTrends: d.attendanceTrends ?? [],
    academicPerformance: d.academicPerformance ?? [],
    certificates: d.certificates ?? [],
  };
}

function emptyExtras(): StudentDetailsTabExtras {
  return {
    payments: [],
    attendanceTrends: [],
    academicPerformance: [],
    certificates: [],
  };
}

function toBundle(
  shell: StudentDetailsTabPayload,
  extras: StudentDetailsTabExtras,
  feeBreakdown: AdminStudentFeeBreakdownResult | null
): StudentDetailsFastBundle {
  return { ...shell, ...extras, feeBreakdown };
}

function cacheBundle(studentId: string, bundle: StudentDetailsFastBundle): void {
  bundleMemory.set(studentId, { value: bundle, expiresAt: Date.now() + BUNDLE_TTL_MS });
  writeSessionBundle(studentId, bundle);
}

export function peekStudentDetailsFast(studentId: string): StudentDetailsFastBundle | null {
  const entry = bundleMemory.get(studentId);
  if (entry && Date.now() < entry.expiresAt) return entry.value;
  return readSessionBundle(studentId);
}

/** Prefetch profile + fees when hovering a student link (no-op if already cached). */
export function warmStudentDetailsBundle(studentId: string): void {
  if (!studentId.trim() || peekStudentDetailsFast(studentId)) return;
  void fetchStudentDetailsFast(studentId).catch(() => {});
}

export function invalidateStudentDetailsFast(studentId?: string) {
  if (studentId) {
    bundleMemory.delete(studentId);
    bundleInflight.delete(studentId);
    extrasInflight.delete(studentId);
    invalidateStudentDetailsCoreCache(studentId);
    invalidateFeeBreakdownCache(studentId);
    const store = readSession();
    delete store[studentId];
    writeSession(store);
    return;
  }
  bundleMemory.clear();
  bundleInflight.clear();
  extrasInflight.clear();
  invalidateFeeBreakdownCache();
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(SESSION_KEY);
}

async function fetchExtras(studentId: string, signal?: AbortSignal): Promise<StudentDetailsTabExtras> {
  const running = extrasInflight.get(studentId);
  if (running) return running;

  const run = fetch(
    `/api/student/${encodeURIComponent(studentId)}/details-bundle?extras=1`,
    { credentials: "include", cache: "no-store", signal }
  )
    .then(async (res) => (res.ok ? parseExtras(await res.json().catch(() => ({}))) : emptyExtras()))
    .catch(() => emptyExtras());

  extrasInflight.set(studentId, run);
  try {
    return await run;
  } finally {
    extrasInflight.delete(studentId);
  }
}

/**
 * One core API call (profile + fees, single DB student read), then extras in background.
 */
export async function fetchStudentDetailsFast(
  studentId: string,
  options?: {
    signal?: AbortSignal;
    onShellLoaded?: (bundle: StudentDetailsFastBundle) => void;
    onBreakdownLoaded?: (breakdown: AdminStudentFeeBreakdownResult) => void;
    onExtrasLoaded?: (bundle: StudentDetailsFastBundle) => void;
  }
): Promise<StudentDetailsFastBundle> {
  const mem = bundleMemory.get(studentId);
  if (mem && Date.now() < mem.expiresAt) {
    return mem.value;
  }

  const sessionHit = readSessionBundle(studentId);
  if (sessionHit) {
    bundleMemory.set(studentId, { value: sessionHit, expiresAt: Date.now() + BUNDLE_TTL_MS });
    return sessionHit;
  }

  const running = bundleInflight.get(studentId);
  if (running) return running;

  const run = (async (): Promise<StudentDetailsFastBundle> => {
    const cachedBreakdown = getFeeBreakdownCached(studentId);
    if (cachedBreakdown) options?.onBreakdownLoaded?.(cachedBreakdown);

    const coreRes = await fetch(
      `/api/student/${encodeURIComponent(studentId)}/details-bundle?core=1`,
      { credentials: "include", cache: "no-store", signal: options?.signal }
    );
    const coreData = await coreRes.json().catch(() => ({}));
    if (!coreRes.ok) {
      throw new Error(
        (coreData as { message?: string })?.message || "Failed to load student profile"
      );
    }

    const { shell, feeBreakdown: coreBreakdown } = parseCore(coreData);
    let feeBreakdown = coreBreakdown ?? cachedBreakdown ?? null;

    if (!feeBreakdown) {
      feeBreakdown = await fetchFeeBreakdownFast(studentId, { signal: options?.signal });
    }
    if (feeBreakdown) {
      setFeeBreakdownCache(studentId, feeBreakdown);
      options?.onBreakdownLoaded?.(feeBreakdown);
    }

    const shellBundle = toBundle(shell, emptyExtras(), feeBreakdown);
    options?.onShellLoaded?.(shellBundle);

    void fetchExtras(studentId, options?.signal)
      .then((extras) => {
        const full = toBundle(shell, extras, feeBreakdown);
        cacheBundle(studentId, full);
        options?.onExtrasLoaded?.(full);
      })
      .catch(() => {});

    const bundle = toBundle(shell, emptyExtras(), feeBreakdown);
    cacheBundle(studentId, bundle);
    return bundle;
  })();

  bundleInflight.set(studentId, run);
  try {
    return await run;
  } finally {
    bundleInflight.delete(studentId);
  }
}
